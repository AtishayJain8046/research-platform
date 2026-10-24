import bcrypt from "bcryptjs";
import { q } from "@/lib/db";

export async function POST(req) {
  const { email, password } = await req.json();
  if (!email || !password || password.length < 6)
    return Response.json({ error: "Email and password (min 6 chars) required" }, { status: 400 });
  try {
    await q("INSERT INTO app_user(email, password_hash, role) VALUES ($1, $2, 'researcher')",
      [email, await bcrypt.hash(password, 10)]);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.code === "23505" ? "Email already registered" : e.message }, { status: 400 });
  }
}
