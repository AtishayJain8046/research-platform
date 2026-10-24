import bcrypt from "bcryptjs";
import { q } from "@/lib/db";
import { signToken } from "@/lib/auth";

export async function POST(req) {
  const { email, password } = await req.json();
  const [u] = await q("SELECT * FROM app_user WHERE email = $1", [email]);
  if (!u || !(await bcrypt.compare(password || "", u.password_hash)))
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  const res = Response.json({ email: u.email, role: u.role });
  res.headers.append("Set-Cookie", `token=${await signToken(u)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  return res;
}
