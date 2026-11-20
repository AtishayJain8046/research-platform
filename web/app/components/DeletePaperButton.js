"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeletePaperButton({ paperId, title, onDeleted, compact = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function del() {
    if (busy) return;
    const msg = `Delete "${title}"?\n\nThis also removes its citations, authorships and keywords. This cannot be undone.`;
    if (!confirm(msg)) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/papers/${paperId}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `Delete failed (${r.status})`); setBusy(false); return; }
    if (onDeleted) onDeleted(j); else router.push("/");
    router.refresh();
  }

  return (
    <span>
      <button className="d" onClick={del} disabled={busy} style={compact ? { padding: "2px 10px", fontSize: 12 } : undefined}>
        {busy ? "Deleting…" : "Delete"}
      </button>
      {err && <span className="err"> {err}</span>}
    </span>
  );
}
