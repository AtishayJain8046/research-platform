import { q, cypher, plain } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const u = await requireRole(); if (u instanceof Response) return u;
  const [totals] = await q(`SELECT (SELECT count(*) FROM paper) papers, (SELECT count(*) FROM researcher) researchers,
                                   (SELECT count(*) FROM citation) citations, (SELECT count(*) FROM conference) conferences`);
  const topPapers = await q(
    `SELECT paper_id, title, pub_year, citation_count, fn_influence_score(paper_id) AS influence
     FROM paper ORDER BY influence DESC NULLS LAST LIMIT 8`);
  const byYear = await q(`SELECT pub_year, count(*)::int AS papers FROM paper GROUP BY pub_year ORDER BY pub_year`);
  const conferences = await q(`SELECT * FROM v_conference_stats WHERE papers > 0 ORDER BY avg_citations DESC`);
  // HAVING + subquery: institutions whose avg paper citations beat the global average
  const institutions = await q(
    `SELECT i.name, count(DISTINCT p.paper_id)::int AS papers, round(avg(p.citation_count),2) AS avg_citations
     FROM institution i JOIN researcher r USING (institution_id) JOIN publication pu USING (researcher_id) JOIN paper p USING (paper_id)
     GROUP BY i.name HAVING avg(p.citation_count) > (SELECT avg(citation_count) FROM paper)
     ORDER BY avg_citations DESC`);
  // Neo4j aggregation: most connected researchers
  const connected = plain(await cypher(
    `MATCH (r:Researcher)-[c:COLLABORATED_WITH]-(o) RETURN r.researcher_id AS researcher_id, r.name AS name,
            count(DISTINCT o) AS collaborators ORDER BY collaborators DESC LIMIT 5`));
  return Response.json({ totals, topPapers, byYear, conferences, institutions, connected });
}
