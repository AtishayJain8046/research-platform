"use client";
import { useState } from "react";
import { useApi } from "../components/useApi";

export default function AddPaper() {
  const { data: meta } = useApi("/api/meta");
  const [f, setF] = useState({ title: "", abstract: "", year: 2025, conference_id: "", doi: "", keywords: "", authors: [], cites: "" });
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const body = { ...f, keywords: f.keywords.split(",").map((s) => s.trim()).filter(Boolean),
      cites: f.cites.split(",").map((s) => s.trim()).filter(Boolean) };
    const r = await fetch("/api/papers", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(r.ok ? { ok: `Paper #${j.paper_id} added (transaction committed, embedding stored, graph synced).` } : { err: j.error });
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Add paper (single transaction: paper + authors + keywords + citations)</h2>
      <div className="row"><input style={{ flex: 1 }} placeholder="Title" value={f.title} onChange={set("title")} /></div>
      <div className="row"><textarea rows={5} placeholder="Abstract (min 20 chars)" value={f.abstract} onChange={set("abstract")} /></div>
      <div className="row">
        <input type="number" value={f.year} onChange={set("year")} />
        <select value={f.conference_id} onChange={set("conference_id")}><option value="">Conference…</option>
          {meta?.conferences.map((c) => <option key={c.conference_id} value={c.conference_id}>{c.acronym}</option>)}</select>
        <input placeholder="DOI" value={f.doi} onChange={set("doi")} />
      </div>
      <div className="row"><input style={{ flex: 1 }} placeholder="Keywords (comma separated)" value={f.keywords} onChange={set("keywords")} /></div>
      <div className="row"><input style={{ flex: 1 }} placeholder="Cited paper IDs (comma separated)" value={f.cites} onChange={set("cites")} /></div>
      <div className="row"><select multiple size={6} value={f.authors} onChange={(e) => setF({ ...f, authors: [...e.target.selectedOptions].map((o) => o.value) })}>
        {meta?.researchers.map((r) => <option key={r.researcher_id} value={r.researcher_id}>{r.full_name}</option>)}</select>
        <span className="muted">Authors (ctrl/cmd-click, order = selection order in list)</span></div>
      <button className="p">Submit</button>
      {msg?.ok && <p>{msg.ok}</p>}{msg?.err && <p className="err">{msg.err}</p>}
    </form>
  );
}
