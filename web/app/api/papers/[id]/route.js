import { q, cypher, plain } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(_req, { params }) {
  const u = await requireRole(); if (u instanceof Response) return u;
  const id = Number((await params).id);
  const [paper] = await q("SELECT *, fn_influence_score(paper_id) AS influence FROM v_paper_details WHERE paper_id=$1", [id]);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });
  const [lineage, similar, citedBy, graphRelated, authors] = await Promise.all([
    q("SELECT * FROM fn_citation_lineage($1, 3)", [id]),
    q(`SELECT s.paper_id, s.title, s.pub_year, 1 - (s.embedding <=> p.embedding) AS similarity
       FROM paper p JOIN paper s ON s.paper_id <> p.paper_id WHERE p.paper_id=$1
       ORDER BY s.embedding <=> p.embedding LIMIT 5`, [id]),
    q(`SELECT p.paper_id, p.title, p.pub_year FROM citation c JOIN paper p ON p.paper_id=c.citing_paper_id
       WHERE c.cited_paper_id=$1 ORDER BY p.pub_year`, [id]),
    cypher(`MATCH (:Paper {paper_id:$id})-[x:RELATED_TO]->(t:Paper) RETURN t.paper_id AS paper_id, t.title AS title, x.score AS score ORDER BY score DESC`, { id }).then(plain),
    q(`SELECT r.researcher_id, r.full_name, i.name AS institution FROM publication pu
       JOIN researcher r USING (researcher_id) LEFT JOIN institution i USING (institution_id)
       WHERE pu.paper_id=$1 ORDER BY pu.author_order`, [id]),
  ]);
  return Response.json({ paper, authors, lineage, similar, citedBy, graphRelated });
}

export async function PUT(req, { params }) {
  const u = await requireRole(["admin"]); if (u instanceof Response) return u;
  const id = Number((await params).id);
  const b = await req.json();
  try {
    await q("UPDATE paper SET title=$1, abstract=$2 WHERE paper_id=$3", [b.title, b.abstract, id]);
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
}

export async function DELETE(_req, { params }) {
  const u = await requireRole(["admin"]); if (u instanceof Response) return u;
  const id = Number((await params).id);
  await q("DELETE FROM paper WHERE paper_id=$1", [id]);
  await cypher("MATCH (p:Paper {paper_id:$id}) DETACH DELETE p", { id });
  return Response.json({ ok: true });
}
