"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "./useMe";

export default function Nav() {
  const { me, setMe } = useMe();
  const router = useRouter();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); setMe(null); router.push("/login"); }
  return (
    <nav>
      <span className="brand">Research Intelligence</span>
      <Link href="/">Dashboard</Link><Link href="/search">Search</Link>
      <Link href="/researchers">Researchers</Link><Link href="/add">Add Paper</Link>
      {me ? <button onClick={logout}>Logout ({me.role})</button> : <Link href="/login">Login</Link>}
    </nav>
  );
}
