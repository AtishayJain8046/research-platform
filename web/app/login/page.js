"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [reg, setReg] = useState(false);
  const router = useRouter();
  async function submit(e) {
    e.preventDefault();
    if (reg) {
      const r = await fetch("/api/auth/register", { method: "POST", body: JSON.stringify(f) });
      if (!r.ok) return setErr((await r.json()).error);
    }
    const r = await fetch("/api/auth/login", { method: "POST", body: JSON.stringify(f) });
    if (!r.ok) return setErr((await r.json()).error);
    window.location.href = "/";
  }
  return (
    <form className="card" style={{ maxWidth: 360, margin: "40px auto" }} onSubmit={submit}>
      <h2>{reg ? "Register" : "Login"}</h2>
      <div className="row"><input style={{ flex: 1 }} placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div className="row"><input style={{ flex: 1 }} type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      {err && <p className="err">{err}</p>}
      <button className="p">{reg ? "Register" : "Login"}</button>{" "}
      <a href="#" onClick={(e) => { e.preventDefault(); setReg(!reg); }}>{reg ? "Have an account?" : "Create account"}</a>
      <p className="muted">Demo: admin@demo.com / admin123 · researcher@demo.com / research123</p>
    </form>
  );
}
