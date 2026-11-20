"use client";
import Link from "next/link";
import { useApi } from "./components/useApi";
import { useMe } from "./components/useMe";
import DeletePaperButton from "./components/DeletePaperButton";

export default function Dashboard() {
  const { data: d, error, refetch } = useApi("/api/dashboard");
  const { data: audit } = useApi("/api/audit");
  const { me } = useMe();
  if (error) return <p className="err">{error}</p>;
  if (!d) return <p>Loading…</p>;
  const max = Math.max(...d.byYear.map((y) => y.papers));
  return (<>
    <div className="grid">
      {Object.entries(d.totals).map(([k, v]) => <div className="card" key={k}><div className="muted">{k}</div><div className="stat">{v}</div></div>)}
    </div>
    <div className="card"><h3>Most influential papers (venue-weighted citations)</h3>
      <table><thead><tr><th>Title</th><th>Year</th><th>Citations</th><th>Influence</th>{me?.role === "admin" && <th />}</tr></thead><tbody>
        {d.topPapers.map((p) => <tr key={p.paper_id}><td><Link href={`/papers/${p.paper_id}`}>{p.title}</Link></td><td>{p.pub_year}</td><td>{p.citation_count}</td><td>{p.influence}</td>
          {me?.role === "admin" && <td><DeletePaperButton compact paperId={p.paper_id} title={p.title} onDeleted={refetch} /></td>}</tr>)}
      </tbody></table></div>
    <div className="card"><h3>Papers per year</h3>
      {d.byYear.map((y) => <div key={y.pub_year} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 40 }}>{y.pub_year}</span><div className="bar" style={{ width: `${(y.papers / max) * 80}%` }} /><span>{y.papers}</span></div>)}
    </div>
    <div className="grid">
      <div className="card"><h3>Venues by avg citations</h3><table><tbody>
        {d.conferences.map((c) => <tr key={c.acronym}><td>{c.acronym}</td><td>{c.rank}</td><td>{c.papers} papers</td><td>{c.avg_citations}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>Institutions above avg citations</h3><table><tbody>
        {d.institutions.map((i) => <tr key={i.name}><td>{i.name}</td><td>{i.papers}</td><td>{i.avg_citations}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>Most connected researchers (Neo4j)</h3><table><tbody>
        {d.connected.map((r) => <tr key={r.researcher_id}><td><Link href={`/researchers/${r.researcher_id}`}>{r.name}</Link></td><td>{r.collaborators} collaborators</td></tr>)}</tbody></table></div>
    </div>
    {audit && <div className="card"><h3>Audit log (admin)</h3><table><tbody>
      {audit.map((a) => <tr key={a.audit_id}><td>{new Date(a.at).toLocaleString()}</td><td>{a.action}</td><td>{a.details}</td></tr>)}</tbody></table></div>}
  </>);
}
