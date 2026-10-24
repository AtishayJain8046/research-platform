import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const key = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function signToken(user) {
  return new SignJWT({ id: user.user_id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("8h").sign(key());
}

export async function getUser() {
  const t = (await cookies()).get("token")?.value;
  if (!t) return null;
  try { return (await jwtVerify(t, key())).payload; } catch { return null; }
}

// Returns user or a Response (401/403) -- usage: const u = await requireRole(["admin"]); if (u instanceof Response) return u;
export async function requireRole(roles = ["admin", "researcher"]) {
  const u = await getUser();
  if (!u) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!roles.includes(u.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return u;
}
