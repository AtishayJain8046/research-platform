"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Nav() {
  const [user, setUser] = useState(null);
  const router = useRouter();
  useEffect(() => { fetch("/api/auth/me").then((r) => r.ok ? r.json() : null).then(setUser); }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); router.push("/login"); }
  return (
    <nav>
      <span className="brand">Research Intelligence</span>
      <Link href="/">Dashboard</Link><Link href="/search">Search</Link>
      <Link href="/researchers">Researchers</Link><Link href="/add">Add Paper</Link>
      {user ? <button onClick={logout}>Logout ({user.role})</button> : <Link href="/login">Login</Link>}
    </nav>
  );
}
