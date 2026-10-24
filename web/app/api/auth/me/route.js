import { getUser } from "@/lib/auth";
export async function GET() {
  const u = await getUser();
  return u ? Response.json(u) : Response.json({ error: "Not authenticated" }, { status: 401 });
}
