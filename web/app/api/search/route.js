import { q, cypher, plain } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { embed, toVec } from "@/lib/embed";

export async function GET(req) {
  const u = await requireRole(); if (u instanceof Response) return u;
  const sp = new URL(req.url).searchParams;
  const query = (sp.get("q") || "").trim();
  const mode = sp.get("mode") || "semantic";
  const minYear = sp.get("minYear") ? Number(sp.get("minYear")) : null;
  if (!query) return Response.json({ papers: [], foundational: [], researchers: [] });

  try {
    let papers;
    if (mode === "fulltext") {
      papers = await q(
        `SELECT paper_id, title, pub_year, citation_count,
                ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS similarity,
                ts_headline('english', abstract, websearch_to_tsquery('english', $1), 'MaxFragments=1,MaxWords=25') AS snippet
         FROM paper
         WHERE search_tsv @@ websearch_to_tsquery('english', $1) AND ($2::int IS NULL OR pub_year >= $2)
         ORDER BY similarity DESC LIMIT 10`, [query, minYear]);
    } else {
      const vec = toVec(await embed(query));
      papers = await q("SELECT * FROM fn_semantic_search($1::vector, 10, $2)", [vec, minYear]);
    }
    const ids = papers.map((p) => p.paper_id);
    const foundational = plain(await cypher(
      `MATCH (p:Paper)-[:CITES*1..2]->(f:Paper) WHERE p.paper_id IN $ids AND NOT f.paper_id IN $ids
       RETURN f.paper_id AS paper_id, f.title AS title, f.year AS year, count(DISTINCT p) AS reach
       ORDER BY reach DESC LIMIT 8`, { ids }));
    const researchers = plain(await cypher(
      `MATCH (r:Researcher)-[:AUTHORED]->(p:Paper) WHERE p.paper_id IN $ids
       OPTIONAL MATCH (r)-[:WORKS_AT]->(i:Institution)
       RETURN r.researcher_id AS researcher_id, r.name AS name, i.name AS institution, count(p) AS papers
       ORDER BY papers DESC LIMIT 8`, { ids }));
    return Response.json({ papers, foundational, researchers });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
