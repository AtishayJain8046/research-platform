import { pool, q, cypher } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { embed, toVec } from "@/lib/embed";

export async function GET(req) {
  const u = await requireRole(); if (u instanceof Response) return u;
  const sp = new URL(req.url).searchParams;
  const rows = await q(
    `SELECT * FROM v_paper_details
     WHERE ($1::int IS NULL OR pub_year = $1) AND ($2::text IS NULL OR conference = $2)
     ORDER BY citation_count DESC LIMIT 50`,
    [sp.get("year") ? Number(sp.get("year")) : null, sp.get("conf") || null]);
  return Response.json(rows);
}

export async function POST(req) {
  const u = await requireRole(); if (u instanceof Response) return u;
  const b = await req.json();
  const authors = (b.authors || []).map(Number);
  const cites = (b.cites || []).map(Number);
  const keywords = b.keywords || [];
  try {
    const vec = toVec(await embed(`${b.title}. ${b.abstract} Keywords: ${keywords.join(", ")}`));
    const { rows } = await pool.query(
      "SELECT fn_add_paper($1,$2,$3,$4,$5,$6::vector,$7::int[],$8::text[],$9::int[]) AS id",
      [b.title, b.abstract, Number(b.year), b.conference_id ? Number(b.conference_id) : null, b.doi || "",
       vec, authors, keywords, cites]);
    const id = rows[0].id;
    // sync graph (SQL is the source of truth)
    await cypher(`MERGE (p:Paper {paper_id:$id}) SET p.title=$title, p.year=$year`, { id, title: b.title, year: Number(b.year) });
    await cypher(`MATCH (p:Paper {paper_id:$id}) UNWIND $a AS aid MATCH (r:Researcher {researcher_id:aid}) MERGE (r)-[:AUTHORED]->(p)`, { id, a: authors });
    await cypher(`MATCH (p:Paper {paper_id:$id}) UNWIND $c AS cid MATCH (t:Paper {paper_id:cid}) MERGE (p)-[:CITES]->(t)`, { id, c: cites });
    await cypher(`MATCH (p:Paper {paper_id:$id})<-[:AUTHORED]-(a:Researcher), (p)<-[:AUTHORED]-(b:Researcher)
                  WHERE a.researcher_id < b.researcher_id MERGE (a)-[c:COLLABORATED_WITH]->(b) ON CREATE SET c.papers = 1 ON MATCH SET c.papers = c.papers + 1`, { id });
    const rel = await q("SELECT paper_id, similarity FROM fn_semantic_search($1::vector, 4) WHERE paper_id <> $2", [vec, id]);
    await cypher(`MATCH (p:Paper {paper_id:$id}) UNWIND $rel AS r MATCH (t:Paper {paper_id:r.paper_id}) MERGE (p)-[x:RELATED_TO]->(t) SET x.score=r.score`,
      { id, rel: rel.map((r) => ({ paper_id: r.paper_id, score: r.similarity })) });
    return Response.json({ paper_id: id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 }); // DB-level validation messages surface here
  }
}
