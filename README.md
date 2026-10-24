# Research Intelligence & Paper Discovery Platform

PostgreSQL (relational + pgvector) + Neo4j (graph) + Next.js.

| Store | Holds | Why |
|---|---|---|
| PostgreSQL | Researcher, Paper, Conference, Institution, Publication, Keyword, Citation, users | Structured, constrained, transactional data |
| pgvector (in Postgres) | 384-dim `all-MiniLM-L6-v2` embeddings of title + abstract + keywords, HNSW index, cosine distance | Semantic search without keyword matching, joinable with SQL filters |
| Neo4j | `AUTHORED`, `CITES`, `COLLABORATED_WITH`, `RELATED_TO`, `WORKS_AT` | Multi-hop traversals and shortest paths |

## Setup
```bash
cp .env.example .env && cp .env.example web/.env.local
docker compose up -d                       # Postgres (schema auto-applied) + Neo4j
python3 -m venv .venv && .venv/bin/pip install -r embedder/requirements.txt
.venv/bin/python db/seed.py                # 220 papers, 60 researchers, citations, embeddings, graph
.venv/bin/uvicorn server:app --app-dir embedder --port 8001   # embedding service (terminal 2)
cd web && npm install && npm run dev       # http://localhost:3000 (terminal 3)
```
Logins: `admin@demo.com / admin123` (can edit/delete, sees audit log), `researcher@demo.com / research123` (search, add papers).

## Where each requirement is demonstrated
- **DDL / constraints / ALTER / DROP / indexes**: `db/schema.sql` (CHECK, UNIQUE, FK actions, GIN, HNSW, B-tree)
- **Views**: `v_paper_details`, `v_researcher_stats`, `v_conference_stats`
- **Functions**: `fn_semantic_search`, `fn_citation_lineage` (recursive CTE), `fn_add_paper` (atomic transaction), `fn_influence_score`
- **Triggers**: citation validation (no citing the future), citation_count maintenance, audit log
- **Full-text search**: generated `tsvector` column + GIN, `websearch_to_tsquery`
- **Vector search**: `/api/search?mode=semantic` -> embed query -> `ORDER BY embedding <=> q`
- **Neo4j**: foundational papers (`CITES*1..2`), topic researchers, `shortestPath`, 2-hop network, aggregation
- **Search pipeline**: Query -> embedding -> vector similarity -> relevant papers -> citation graph (foundational papers) + researchers
- **Auth**: bcrypt + JWT in HttpOnly cookie, roles `admin` / `researcher` enforced in API routes
- **Secrets**: all via environment variables
