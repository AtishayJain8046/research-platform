"use client";
import Link from "next/link";
import { useState } from "react";

export default function Search() {
  const [q, setQ] = useState("database indexing in distributed systems");
  const [mode, setMode] = useState("semantic");
  const [minYear, setMinYear] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  async function go(e) {
    e.preventDefault(); setErr("");
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&mode=${mode}&minYear=${minYear}`);
    if (r.status === 401) return (window.location.href = "/login");
    const j = await r.json();
    r.ok ? setRes(j) : setErr(j.error);
  }
  return (<>
    <form className="card" onSubmit={go}>
      <div className="row">
        <input style={{ flex: 1, minWidth: 300 }} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="semantic">Semantic (pgvector)</option><option value="fulltext">Full-text (tsvector)</option></select>
        <input style={{ width: 110 }} placeholder="From year" value={minYear} onChange={(e) => setMinYear(e.target.value)} />
        <button className="p">Search</button>
      </div>
    </form>
    {err && <p className="err">{err}</p>}
    {res && (<>
      <div className="card"><h3>Relevant papers</h3><table><thead><tr><th>Title</th><th>Year</th><th>Cites</th><th>Score</th></tr></thead><tbody>
        {res.papers.map((p) => <tr key={p.paper_id}><td><Link href={`/papers/${p.paper_id}`}>{p.title}</Link>
          {p.snippet && <div className="muted" dangerouslySetInnerHTML={{ __html: p.snippet }} />}</td>
          <td>{p.pub_year}</td><td>{p.citation_count}</td><td>{Number(p.similarity).toFixed(3)}</td></tr>)}</tbody></table></div>
      <div className="grid">
        <div className="card"><h3>Foundational papers (citation graph, ≤2 hops)</h3><table><tbody>
          {res.foundational.map((p) => <tr key={p.paper_id}><td><Link href={`/papers/${p.paper_id}`}>{p.title}</Link></td><td>{p.year}</td><td><span className="badge">cited by {p.reach} results</span></td></tr>)}</tbody></table></div>
        <div className="card"><h3>Researchers on this topic</h3><table><tbody>
          {res.researchers.map((r) => <tr key={r.researcher_id}><td><Link href={`/researchers/${r.researcher_id}`}>{r.name}</Link></td><td>{r.institution}</td><td>{r.papers} papers</td></tr>)}</tbody></table></div>
      </div></>)}
  </>);
}
