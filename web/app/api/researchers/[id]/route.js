import { q, cypher, plain } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(_req, { params }) {
  const u = await requireRole(); if (u instanceof Response) return u;
  const id = Number((await params).id);
  const [info] = await q("SELECT * FROM v_researcher_stats WHERE researcher_id=$1", [id]);
  if (!info) return Response.json({ error: "Not found" }, { status: 404 });
  const papers = await q(
    `SELECT p.paper_id, p.title, p.pub_year, p.citation_count FROM publication pu
     JOIN paper p USING (paper_id) WHERE pu.researcher_id=$1 ORDER BY p.citation_count DESC`, [id]);
  const collaborators = plain(await cypher(
    `MATCH (:Researcher {researcher_id:$id})-[c:COLLABORATED_WITH]-(o:Researcher)
     RETURN o.researcher_id AS researcher_id, o.name AS name, c.papers AS papers ORDER BY papers DESC LIMIT 10`, { id }));
  // 2nd-degree: collaborators of collaborators, not yet direct
  const extended = plain(await cypher(
    `MATCH (me:Researcher {researcher_id:$id})-[:COLLABORATED_WITH*2]-(o:Researcher)
     WHERE o <> me AND NOT (me)-[:COLLABORATED_WITH]-(o)
     RETURN o.researcher_id AS researcher_id, o.name AS name, count(*) AS paths ORDER BY paths DESC LIMIT 8`, { id }));
  return Response.json({ info, papers, collaborators, extended });
}
