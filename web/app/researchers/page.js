"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi } from "../components/useApi";

export default function Researchers() {
  const [q, setQ] = useState("");
  const [minPapers, setMin] = useState(0);
  const { data } = useApi(`/api/researchers?q=${encodeURIComponent(q)}&minPapers=${minPapers}`);
  const { data: meta } = useApi("/api/meta");
  const [path, setPath] = useState({ from: "", to: "" });
  const [res, setRes] = useState(null);
  async function find() { setRes(await (await fetch(`/api/graph/path?from=${path.from}&to=${path.to}`)).json()); }
  return (<>
    <div className="card"><h3>Collaboration path (Neo4j shortestPath)</h3><div className="row">
      {["from", "to"].map((k) => <select key={k} value={path[k]} onChange={(e) => setPath({ ...path, [k]: e.target.value })}>
        <option value="">{k}…</option>{meta?.researchers.map((r) => <option key={r.researcher_id} value={r.researcher_id}>{r.full_name}</option>)}</select>)}
      <button className="p" onClick={find}>Find path</button></div>
      {res && (res.hops === null ? <p>No connection found.</p> : <p>{res.names.join(" → ")} <span className="badge">{res.hops} hops</span></p>)}</div>
    <div className="card"><div className="row"><input placeholder="Search name/area" value={q} onChange={(e) => setQ(e.target.value)} />
      <label>Min papers <input type="number" style={{ width: 70 }} value={minPapers} onChange={(e) => setMin(e.target.value)} /></label></div>
      <table><thead><tr><th>Name</th><th>Institution</th><th>Area</th><th>Papers</th><th>Citations</th></tr></thead><tbody>
        {data?.map((r) => <tr key={r.researcher_id}><td><Link href={`/researchers/${r.researcher_id}`}>{r.full_name}</Link></td><td>{r.institution}</td><td>{r.research_area}</td><td>{r.paper_count}</td><td>{r.total_citations}</td></tr>)}</tbody></table></div>
  </>);
}
