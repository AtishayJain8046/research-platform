# Viva / Project Explanation Guide

## 1. 30-second pitch
Researchers can't easily find related papers, influential papers, or people working on a topic. Our platform stores structured data in **PostgreSQL**, paper meaning as **vector embeddings (pgvector)**, and relationships in **Neo4j**. A natural-language query is embedded, matched to similar papers, then expanded through the citation graph to find foundational papers and connected researchers.

## 2. Why three paradigms (justification, the examiner's favourite)
| Data | Store | Reason |
|---|---|---|
| Researchers, papers, conferences, institutions, authorship, users | PostgreSQL | Fixed schema, integrity (PK/FK/CHECK), transactions, joins, aggregation |
| Embeddings of title+abstract+keywords | pgvector (inside Postgres) | Semantic similarity needs vectors. Keeping them in Postgres lets us combine similarity with SQL filters (year) and avoids a second system to keep in sync |
| Citations, co-authorship, related papers | Neo4j | Multi-hop traversals (`CITES*1..2`), shortest path. These need recursive self-joins in SQL and are natural in a graph |

Be honest: Postgres is the **source of truth**. Neo4j is a derived, traversal-optimised copy. We also implemented the citation lineage in SQL with a recursive CTE so you can compare both.

## 3. Architecture
```
Browser (Next.js pages)
   -> Next.js Route Handlers (/api/*)  [JWT cookie auth, role checks]
        -> PostgreSQL (+pgvector)   queries, functions, transactions
        -> Neo4j                    Cypher graph queries
        -> Embedding service (FastAPI, all-MiniLM-L6-v2) for query/paper embeddings
```
Credentials come from `.env` (never hard-coded).

## 4. ER diagram / relational schema (explain this)
Entities: **Institution, Researcher, Conference, Paper, Keyword, app_user, audit_log**.
Relationships:
- Institution 1 --- N Researcher (`researcher.institution_id`, ON DELETE SET NULL)
- Conference 1 --- N Paper
- Researcher M --- N Paper via **publication** (PK `(paper_id, researcher_id)`, `author_order`, UNIQUE `(paper_id, author_order)`)
- Paper M --- N Keyword via **paper_keyword**
- Paper M --- N Paper via **citation** (`citing_paper_id`, `cited_paper_id`, CHECK they differ) is a recursive/unary M:N
- app_user 1 --- 0..1 Researcher

Normalisation: all tables are in 3NF. One deliberate denormalisation: `paper.citation_count`, kept consistent by a trigger (read performance for ranking). Be ready to say that.

## 4b. Data dictionary highlights
- `paper.embedding vector(384)`, `paper.search_tsv tsvector GENERATED ALWAYS AS ... STORED`
- `researcher.email` regex CHECK, `h_index >= 0`
- `conference.rank IN ('A*','A','B','C')`
- `paper.pub_year BETWEEN 1950 AND 2100`, `abstract length >= 20`
- `keyword.term = lower(term)`

## 5. Advanced SQL features (need 4, we have many)
| Feature | Where | Say |
|---|---|---|
| Triggers | `citation_validate`, `citation_count_sync`, `paper_audit` | Rejects citing a later-year paper; keeps count consistent; logs changes |
| Views | `v_paper_details`, `v_researcher_stats`, `v_conference_stats` | Hide joins/aggregates from the app |
| Stored functions | `fn_semantic_search`, `fn_citation_lineage`, `fn_add_paper`, `fn_influence_score` | Logic lives in DB |
| Recursive CTE | `fn_citation_lineage` | Walks citation ancestry to depth N; `UNION` (not `UNION ALL`) plus a depth limit protects against cycles |
| Transactions | `fn_add_paper` | Paper + authors + keywords + citations are all-or-nothing. A bad citation rolls back the paper |
| Indexes | B-tree, GIN (tsvector), HNSW (vector) | See below |
| Full-text search | generated tsvector, weights A (title) / B (abstract), `websearch_to_tsquery`, `ts_headline` | |
| DB-level validation | CHECK/UNIQUE/FK + triggers | Even if the app is bypassed, bad data is rejected |

DDL coverage: CREATE, ALTER (`venue_type` column + constraint), DROP (`DROP TABLE IF EXISTS` at top). DML: INSERT/UPDATE/DELETE via paper add/edit/delete; SELECT with JOIN, GROUP BY, HAVING (institutions above global average citations, with a subquery), ORDER BY, aggregates.

## 6. Vector search: the five questions the PDF asks
1. **What is embedded?** `title + abstract + keywords` of each paper, and the user's query at search time.
2. **Which model?** `sentence-transformers/all-MiniLM-L6-v2`, 384-dim, runs locally, free.
3. **How stored?** `vector(384)` column in `paper` (pgvector). Vectors are L2-normalised.
4. **Metric?** Cosine distance (`<=>`); similarity = `1 - distance`. Normalised vectors make cosine equal to dot product.
5. **Retrieval?** Embed query -> `ORDER BY embedding <=> q LIMIT k` using an **HNSW** index (approximate nearest neighbour: fast, tiny recall loss) -> optional year filter.

Why semantic beats keyword: "database indexing in distributed systems" also finds "adaptive indexing for distributed databases" without exact word match. Show both modes side-by-side in the demo.

## 7. Neo4j model
Nodes: `Paper, Researcher, Institution`. Edges: `AUTHORED, CITES, COLLABORATED_WITH (papers count), RELATED_TO (score), WORKS_AT`.
- `COLLABORATED_WITH` is **derived** from co-authorship; `RELATED_TO` is **derived** from embedding similarity (top-3 neighbours, cosine >= 0.5).
- Constraints: unique ids on Paper/Researcher/Institution.
Key queries:
- Foundational papers: `MATCH (p)-[:CITES*1..2]->(f) WHERE p.paper_id IN $ids ... count(DISTINCT p)` = how many search results rely on f
- Topic researchers: `(r)-[:AUTHORED]->(p)` grouped by researcher
- Collaboration path: `shortestPath((a)-[:COLLABORATED_WITH*..6]-(b))`
- 2-hop network: collaborators of collaborators not already direct

## 8. End-to-end demo script (5 min)
1. Show ER diagram + `schema.sql` (constraints, indexes, triggers).
2. Login as **researcher**: Search "database indexing in distributed systems" (semantic) -> results, foundational papers, researchers. Then same in full-text mode.
3. Open a paper: recursive-CTE lineage, cited-by, pgvector similar, Neo4j RELATED_TO.
4. Researchers page: shortest collaboration path; open a researcher: 2-hop network.
5. Add paper citing a later year paper -> trigger error, nothing saved (transaction). Then add a valid one -> appears in search and graph.
6. Login as **admin**: delete button, audit log on dashboard. Show researcher gets 403 on admin actions.
7. Dashboard: HAVING/subquery and Neo4j aggregation.
8. Show `.env` / `.gitignore` (no hard-coded credentials).

## 9. Likely viva questions and answers
- **Why not just Postgres for everything?** It could (recursive CTE does citations, and we implemented one). But multi-hop traversals and shortest path are far simpler and faster in Cypher on large graphs; both are shown.
- **What if Postgres and Neo4j diverge?** Postgres is the source of truth; the API writes SQL first, then syncs the graph. Weakness: no distributed transaction. Fix: outbox table / re-run a sync job. A re-seed rebuilds the graph.
- **HNSW vs IVFFlat vs exact?** HNSW: better recall/speed, no training step, more memory/build time. Exact scan is fine for 220 rows but doesn't scale.
- **Why cosine?** We care about direction (topic), not magnitude.
- **ACID in your project?** `fn_add_paper` is atomic; if any citation violates the trigger, the whole function rolls back. Isolation default is READ COMMITTED.
- **Why a trigger for citation_count?** Keeps denormalised data consistent regardless of which client writes.
- **Why UNION in the recursive CTE?** Dedupes rows and stops infinite loops on citation cycles; depth cap adds a second guard.
- **How is auth done?** bcrypt hashes, JWT (HS256) in HttpOnly cookie, role checked server-side in every route (`requireRole`). Roles: admin, researcher.
- **SQL injection?** All queries are parameterised (`$1`), never string concatenated.
- **Weakness of the embedding approach?** The model is general-purpose and not trained on scientific text (SPECTER would be better). Data is synthetic, so similarity clusters by template topic.
- **What is the influence score?** `citation_count x venue weight` (A*=2.0, A=1.5, B=1.2, C=1.0), a simple heuristic. PageRank in Neo4j is the natural upgrade.
- **Future work:** real data (OpenAlex/arXiv), PageRank/GDS, hybrid search (RRF of FTS + vector), SPECTER embeddings, citation-recommendation.

## 10. Team split suggestion (the PDF requires both to touch DB and app)
- **Member A:** Postgres schema, triggers/functions/views, pgvector + embedding service, SQL-side API routes, dashboard page.
- **Member B:** Neo4j model and sync, Cypher queries, auth/roles, search/paper/researcher pages, seed script.
Each should also be able to explain the other's half at a high level. Make commits under your own names.

## 11. Be ready to admit
- Data is synthetic. Embeddings of templated text cluster very cleanly.
- No automated tests yet. The PDF wants test cases and results, so write a test table (input -> expected -> actual) from the demo script above.
- No ER diagram image yet. Draw one from section 4.
