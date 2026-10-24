import { q } from "@/lib/db";
import { requireRole } from "@/lib/auth";
export async function GET() {
  const u = await requireRole(["admin"]); if (u instanceof Response) return u;
  return Response.json(await q("SELECT * FROM audit_log ORDER BY at DESC LIMIT 30"));
}
