export async function embed(text) {
  const r = await fetch(process.env.EMBED_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: [text] }),
  });
  if (!r.ok) throw new Error("Embedding service unavailable");
  return (await r.json()).embeddings[0];
}
export const toVec = (a) => "[" + a.join(",") + "]";
