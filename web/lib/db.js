import { Pool } from "pg";
import neo4j from "neo4j-driver";

const g = globalThis;
export const pool = g._pg ||= new Pool({
  host: process.env.PG_HOST, port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DATABASE,
});
export const driver = g._neo ||= neo4j.driver(
  process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD));

export const q = (text, params) => pool.query(text, params).then((r) => r.rows);

export async function cypher(text, params = {}) {
  const s = driver.session();
  try {
    const res = await s.run(text, params);
    return res.records.map((r) => r.toObject());
  } finally { await s.close(); }
}

// Convert neo4j Integer values to plain numbers
export function plain(v) {
  if (neo4j.isInt(v)) return v.toNumber();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}
