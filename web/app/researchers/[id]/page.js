"use client";
import Link from "next/link";
import { use } from "react";
import { useApi } from "../../components/useApi";

export default function ResearcherPage({ params }) {
  const { id } = use(params);
  const { data: d, error } = useApi(`/api/researchers/${id}`);
  if (error) return <p className="err">{error}</p>;
  if (!d) return <p>Loading…</p>;
  const R = ({ r, x }) => <tr><td><Link href={`/researchers/${r.researcher_id}`}>{r.name}</Link></td><td>{x}</td></tr>;
  return (<>
    <div className="card"><h2>{d.info.full_name}</h2><p className="muted">{d.info.institution} · {d.info.research_area} · {d.info.paper_count} papers · {d.info.total_citations} citations</p></div>
    <div className="grid">
      <div className="card"><h3>Direct collaborators</h3><table><tbody>{d.collaborators.map((r) => <R key={r.researcher_id} r={r} x={`${r.papers} joint`} />)}</tbody></table></div>
      <div className="card"><h3>Extended network (2 hops)</h3><table><tbody>{d.extended.map((r) => <R key={r.researcher_id} r={r} x={`${r.paths} paths`} />)}</tbody></table></div>
    </div>
    <div className="card"><h3>Papers</h3><table><tbody>{d.papers.map((p) => <tr key={p.paper_id}><td><Link href={`/papers/${p.paper_id}`}>{p.title}</Link></td><td>{p.pub_year}</td><td>{p.citation_count}</td></tr>)}</tbody></table></div>
  </>);
}
