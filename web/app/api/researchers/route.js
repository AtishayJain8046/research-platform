import { q } from "@/lib/db";
import { requireRole } from "@/lib/auth";
export async function GET(req) {
  const u = await requireRole(); if (u instanceof Response) return u;
  const sp = new URL(req.url).searchParams;
  const rows = await q(
    `SELECT * FROM v_researcher_stats
     WHERE ($1::text IS NULL OR full_name ILIKE '%'||$1||'%' OR research_area ILIKE '%'||$1||'%')
       AND paper_count >= $2
     ORDER BY total_citations DESC LIMIT 50`, [sp.get("q") || null, Number(sp.get("minPapers") || 0)]);
  return Response.json(rows);
}
