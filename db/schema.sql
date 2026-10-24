-- Research Intelligence & Paper Discovery Platform : PostgreSQL schema
-- Demonstrates: DDL, constraints, indexes (B-tree, GIN, HNSW), views,
-- stored functions/procedures, triggers, recursive CTEs, transactions, FTS, pgvector.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------- DROP (idempotent re-run)
DROP TABLE IF EXISTS audit_log, citation, paper_keyword, publication, keyword,
                     paper, conference, app_user, researcher, institution CASCADE;

-- ---------------------------------------------------------------- TABLES
CREATE TABLE institution (
    institution_id SERIAL PRIMARY KEY,
    name           VARCHAR(200) NOT NULL UNIQUE,
    country        VARCHAR(100) NOT NULL,
    city           VARCHAR(100)
);

CREATE TABLE researcher (
    researcher_id  SERIAL PRIMARY KEY,
    full_name      VARCHAR(150) NOT NULL CHECK (length(trim(full_name)) > 1),
    email          VARCHAR(200) NOT NULL UNIQUE
                   CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
    institution_id INT REFERENCES institution(institution_id) ON DELETE SET NULL,
    research_area  VARCHAR(150),
    h_index        INT NOT NULL DEFAULT 0 CHECK (h_index >= 0)
);

CREATE TABLE app_user (
    user_id       SERIAL PRIMARY KEY,
    email         VARCHAR(200) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'researcher'
                  CHECK (role IN ('admin', 'researcher')),
    researcher_id INT UNIQUE REFERENCES researcher(researcher_id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conference (
    conference_id SERIAL PRIMARY KEY,
    name          VARCHAR(200) NOT NULL UNIQUE,
    acronym       VARCHAR(20)  NOT NULL UNIQUE,
    field         VARCHAR(100) NOT NULL,
    rank          CHAR(2) NOT NULL DEFAULT 'A' CHECK (rank IN ('A*', 'A', 'B', 'C'))
);

CREATE TABLE paper (
    paper_id       SERIAL PRIMARY KEY,
    title          VARCHAR(400) NOT NULL,
    abstract       TEXT NOT NULL CHECK (length(abstract) >= 20),
    pub_year       INT NOT NULL CHECK (pub_year BETWEEN 1950 AND 2100),
    conference_id  INT REFERENCES conference(conference_id) ON DELETE SET NULL,
    doi            VARCHAR(100) UNIQUE,
    citation_count INT NOT NULL DEFAULT 0 CHECK (citation_count >= 0),
    embedding      vector(384),
    search_tsv     tsvector GENERATED ALWAYS AS (
                     setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                     setweight(to_tsvector('english', coalesce(abstract, '')), 'B')
                   ) STORED
);

-- Publication = authorship (M:N Researcher <-> Paper)
CREATE TABLE publication (
    paper_id      INT NOT NULL REFERENCES paper(paper_id) ON DELETE CASCADE,
    researcher_id INT NOT NULL REFERENCES researcher(researcher_id) ON DELETE CASCADE,
    author_order  INT NOT NULL CHECK (author_order >= 1),
    PRIMARY KEY (paper_id, researcher_id),
    UNIQUE (paper_id, author_order)
);

CREATE TABLE keyword (
    keyword_id SERIAL PRIMARY KEY,
    term       VARCHAR(80) NOT NULL UNIQUE CHECK (term = lower(term))
);

CREATE TABLE paper_keyword (
    paper_id   INT NOT NULL REFERENCES paper(paper_id) ON DELETE CASCADE,
    keyword_id INT NOT NULL REFERENCES keyword(keyword_id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, keyword_id)
);

CREATE TABLE citation (
    citing_paper_id INT NOT NULL REFERENCES paper(paper_id) ON DELETE CASCADE,
    cited_paper_id  INT NOT NULL REFERENCES paper(paper_id) ON DELETE CASCADE,
    PRIMARY KEY (citing_paper_id, cited_paper_id),
    CHECK (citing_paper_id <> cited_paper_id)
);

CREATE TABLE audit_log (
    audit_id   BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    action     VARCHAR(10) NOT NULL,
    row_id     INT,
    details    TEXT,
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- ALTER examples
ALTER TABLE paper ADD COLUMN IF NOT EXISTS venue_type VARCHAR(20) DEFAULT 'conference';
ALTER TABLE paper ADD CONSTRAINT chk_venue_type CHECK (venue_type IN ('conference', 'journal', 'preprint'));

-- ---------------------------------------------------------------- INDEXES
CREATE INDEX idx_paper_year        ON paper(pub_year);
CREATE INDEX idx_paper_conf        ON paper(conference_id);
CREATE INDEX idx_paper_tsv         ON paper USING GIN (search_tsv);
CREATE INDEX idx_paper_embedding   ON paper USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_pub_researcher    ON publication(researcher_id);
CREATE INDEX idx_citation_cited    ON citation(cited_paper_id);
CREATE INDEX idx_researcher_inst   ON researcher(institution_id);

-- ---------------------------------------------------------------- VIEWS
CREATE OR REPLACE VIEW v_paper_details AS
SELECT p.paper_id, p.title, p.abstract, p.pub_year, p.citation_count, p.doi,
       c.acronym AS conference, c.rank AS conference_rank,
       (SELECT string_agg(r.full_name, ', ' ORDER BY pu.author_order)
          FROM publication pu JOIN researcher r USING (researcher_id)
         WHERE pu.paper_id = p.paper_id) AS authors,
       (SELECT string_agg(k.term, ', ' ORDER BY k.term)
          FROM paper_keyword pk JOIN keyword k USING (keyword_id)
         WHERE pk.paper_id = p.paper_id) AS keywords
FROM paper p LEFT JOIN conference c USING (conference_id);

CREATE OR REPLACE VIEW v_researcher_stats AS
SELECT r.researcher_id, r.full_name, i.name AS institution, r.research_area,
       COUNT(DISTINCT pu.paper_id)         AS paper_count,
       COALESCE(SUM(p.citation_count), 0)  AS total_citations
FROM researcher r
LEFT JOIN institution i USING (institution_id)
LEFT JOIN publication pu USING (researcher_id)
LEFT JOIN paper p USING (paper_id)
GROUP BY r.researcher_id, r.full_name, i.name, r.research_area;

CREATE OR REPLACE VIEW v_conference_stats AS
SELECT c.conference_id, c.acronym, c.field, c.rank,
       COUNT(p.paper_id) AS papers,
       ROUND(AVG(p.citation_count), 2) AS avg_citations
FROM conference c LEFT JOIN paper p USING (conference_id)
GROUP BY c.conference_id, c.acronym, c.field, c.rank;

-- ---------------------------------------------------------------- TRIGGERS
-- 1. Validate citation (a paper cannot cite a paper from the future)
CREATE OR REPLACE FUNCTION trg_validate_citation() RETURNS trigger AS $$
DECLARE y_citing INT; y_cited INT;
BEGIN
    SELECT pub_year INTO y_citing FROM paper WHERE paper_id = NEW.citing_paper_id;
    SELECT pub_year INTO y_cited  FROM paper WHERE paper_id = NEW.cited_paper_id;
    IF y_cited > y_citing THEN
        RAISE EXCEPTION 'Invalid citation: paper % (%) cannot cite later paper % (%)',
            NEW.citing_paper_id, y_citing, NEW.cited_paper_id, y_cited;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER citation_validate BEFORE INSERT ON citation
FOR EACH ROW EXECUTE FUNCTION trg_validate_citation();

-- 2. Keep denormalised citation_count consistent
CREATE OR REPLACE FUNCTION trg_maintain_citation_count() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE paper SET citation_count = citation_count + 1 WHERE paper_id = NEW.cited_paper_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE paper SET citation_count = GREATEST(citation_count - 1, 0) WHERE paper_id = OLD.cited_paper_id;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER citation_count_sync AFTER INSERT OR DELETE ON citation
FOR EACH ROW EXECUTE FUNCTION trg_maintain_citation_count();

-- 3. Audit log for paper changes
CREATE OR REPLACE FUNCTION trg_audit_paper() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log(table_name, action, row_id, details) VALUES ('paper', 'DELETE', OLD.paper_id, OLD.title);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.title IS DISTINCT FROM OLD.title OR NEW.abstract IS DISTINCT FROM OLD.abstract THEN
            INSERT INTO audit_log(table_name, action, row_id, details) VALUES ('paper', 'UPDATE', NEW.paper_id, NEW.title);
        END IF;
        RETURN NEW;
    ELSE
        INSERT INTO audit_log(table_name, action, row_id, details) VALUES ('paper', 'INSERT', NEW.paper_id, NEW.title);
        RETURN NEW;
    END IF;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER paper_audit AFTER INSERT OR UPDATE OR DELETE ON paper
FOR EACH ROW EXECUTE FUNCTION trg_audit_paper();

-- ---------------------------------------------------------------- STORED FUNCTIONS
-- Semantic search: cosine distance over pgvector HNSW index
CREATE OR REPLACE FUNCTION fn_semantic_search(q vector(384), lim INT DEFAULT 10, min_year INT DEFAULT NULL)
RETURNS TABLE (paper_id INT, title TEXT, pub_year INT, citation_count INT, similarity FLOAT8) AS $$
    SELECT p.paper_id, p.title::text, p.pub_year, p.citation_count, 1 - (p.embedding <=> q)
    FROM paper p
    WHERE p.embedding IS NOT NULL AND (min_year IS NULL OR p.pub_year >= min_year)
    ORDER BY p.embedding <=> q
    LIMIT lim;
$$ LANGUAGE sql STABLE;

-- Recursive CTE: citation ancestry (papers a given paper builds upon)
CREATE OR REPLACE FUNCTION fn_citation_lineage(start_id INT, max_depth INT DEFAULT 3)
RETURNS TABLE (paper_id INT, title TEXT, pub_year INT, citation_count INT, depth INT) AS $$
    WITH RECURSIVE lineage(paper_id, depth) AS (
        SELECT cited_paper_id, 1 FROM citation WHERE citing_paper_id = start_id
        UNION
        SELECT c.cited_paper_id, l.depth + 1
        FROM citation c JOIN lineage l ON c.citing_paper_id = l.paper_id
        WHERE l.depth < max_depth
    )
    SELECT p.paper_id, p.title::text, p.pub_year, p.citation_count, MIN(l.depth)
    FROM lineage l JOIN paper p USING (paper_id)
    GROUP BY p.paper_id, p.title, p.pub_year, p.citation_count
    ORDER BY p.citation_count DESC, MIN(l.depth);
$$ LANGUAGE sql STABLE;

-- Transactional procedure: add paper + authors + keywords atomically
CREATE OR REPLACE FUNCTION fn_add_paper(
    p_title TEXT, p_abstract TEXT, p_year INT, p_conf INT, p_doi TEXT,
    p_embedding vector(384), p_authors INT[], p_keywords TEXT[], p_cites INT[]
) RETURNS INT AS $$
DECLARE new_id INT; kw TEXT; kid INT; i INT; c INT;
BEGIN
    IF p_authors IS NULL OR array_length(p_authors, 1) IS NULL THEN
        RAISE EXCEPTION 'A paper needs at least one author';
    END IF;
    INSERT INTO paper(title, abstract, pub_year, conference_id, doi, embedding)
    VALUES (p_title, p_abstract, p_year, p_conf, NULLIF(p_doi, ''), p_embedding)
    RETURNING paper_id INTO new_id;

    FOR i IN 1 .. array_length(p_authors, 1) LOOP
        INSERT INTO publication(paper_id, researcher_id, author_order) VALUES (new_id, p_authors[i], i);
    END LOOP;

    FOREACH kw IN ARRAY COALESCE(p_keywords, ARRAY[]::TEXT[]) LOOP
        INSERT INTO keyword(term) VALUES (lower(trim(kw))) ON CONFLICT (term) DO NOTHING;
        SELECT keyword_id INTO kid FROM keyword WHERE term = lower(trim(kw));
        INSERT INTO paper_keyword VALUES (new_id, kid) ON CONFLICT DO NOTHING;
    END LOOP;

    FOREACH c IN ARRAY COALESCE(p_cites, ARRAY[]::INT[]) LOOP
        INSERT INTO citation VALUES (new_id, c);  -- trigger validates & updates counts
    END LOOP;
    RETURN new_id;  -- any exception above rolls back the whole function
END $$ LANGUAGE plpgsql;

-- Influence score: citations weighted by the rank of the venue
CREATE OR REPLACE FUNCTION fn_influence_score(pid INT) RETURNS NUMERIC AS $$
    SELECT ROUND(p.citation_count *
           CASE c.rank WHEN 'A*' THEN 2.0 WHEN 'A' THEN 1.5 WHEN 'B' THEN 1.2 ELSE 1.0 END, 2)
    FROM paper p LEFT JOIN conference c USING (conference_id)
    WHERE p.paper_id = pid;
$$ LANGUAGE sql STABLE;
