import { q } from "@/lib/db";
import { requireRole } from "@/lib/auth";
export async function GET() {
  const u = await requireRole(); if (u instanceof Response) return u;
  const [conferences, researchers] = await Promise.all([
    q("SELECT conference_id, acronym FROM conference ORDER BY acronym"),
    q("SELECT researcher_id, full_name FROM researcher ORDER BY full_name"),
  ]);
  return Response.json({ conferences, researchers });
}
