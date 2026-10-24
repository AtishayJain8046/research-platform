"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useApi } from "../../components/useApi";

const List = ({ title, rows, extra }) => (
  <div className="card"><h3>{title}</h3>{rows.length === 0 ? <p className="muted">None</p> : <table><tbody>
    {rows.map((p) => <tr key={p.paper_id}><td><Link href={`/papers/${p.paper_id}`}>{p.title}</Link></td><td>{p.pub_year ?? ""}</td><td>{extra?.(p)}</td></tr>)}</tbody></table>}</div>);

export default function PaperPage({ params }) {
  const { id } = use(params);
  const { data: d, error } = useApi(`/api/papers/${id}`);
  const [me, setMe] = useState(null);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then(setMe); }, []);
  if (error) return <p className="err">{error}</p>;
  if (!d) return <p>Loading…</p>;
  const p = d.paper;
  async function del() {
    if (!confirm("Delete this paper?")) return;
    await fetch(`/api/papers/${id}`, { method: "DELETE" }); window.location.href = "/";
  }
  return (<>
    <div className="card"><h2>{p.title}</h2>
      <p className="muted">{p.pub_year} · {p.conference} ({p.conference_rank}) · {p.citation_count} citations · influence {p.influence}</p>
      <p>{p.abstract}</p><p><b>Keywords:</b> {p.keywords}</p>
      <p><b>Authors:</b> {d.authors.map((a) => <span key={a.researcher_id}><Link href={`/researchers/${a.researcher_id}`}>{a.full_name}</Link> ({a.institution}) </span>)}</p>
      {me?.role === "admin" && <button className="d" onClick={del}>Delete paper</button>}</div>
    <div className="grid">
      <List title="Influences (recursive CTE, depth ≤ 3)" rows={d.lineage} extra={(x) => <span className="badge">depth {x.depth} · {x.citation_count} cites</span>} />
      <List title="Cited by" rows={d.citedBy} />
      <List title="Semantically similar (pgvector)" rows={d.similar} extra={(x) => Number(x.similarity).toFixed(3)} />
      <List title="RELATED_TO (Neo4j)" rows={d.graphRelated} extra={(x) => Number(x.score).toFixed(3)} />
    </div></>);
}
