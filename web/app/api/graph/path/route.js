import { cypher, plain } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(req) {
  const u = await requireRole(); if (u instanceof Response) return u;
  const sp = new URL(req.url).searchParams;
  const rows = plain(await cypher(
    `MATCH (a:Researcher {researcher_id:$a}), (b:Researcher {researcher_id:$b})
     MATCH p = shortestPath((a)-[:COLLABORATED_WITH*..6]-(b))
     RETURN [n IN nodes(p) | n.name] AS names, length(p) AS hops`,
    { a: Number(sp.get("from")), b: Number(sp.get("to")) }));
  return Response.json(rows[0] || { names: [], hops: null });
}
