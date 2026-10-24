"""Seed PostgreSQL (relational + pgvector) and Neo4j (graph) with synthetic research data.

Run from repo root:  python db/seed.py
"""
import os
import random
import numpy as np
import bcrypt
import psycopg
from dotenv import load_dotenv
from neo4j import GraphDatabase
from sentence_transformers import SentenceTransformer

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
random.seed(42)

PG_DSN = (f"host={os.getenv('PG_HOST','localhost')} port={os.getenv('PG_PORT','5432')} "
          f"user={os.getenv('PG_USER','rip')} password={os.getenv('PG_PASSWORD','rip_pass')} "
          f"dbname={os.getenv('PG_DATABASE','ripdb')}")
NEO_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO_AUTH = (os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "neo4j_pass"))

# ------------------------------------------------------------------ topic templates
TOPICS = {
    "Database Indexing": dict(
        kw=["indexing", "b-tree", "learned index", "lsm-tree", "query optimization"],
        subj=["B-tree indexes", "learned indexes", "LSM-tree storage engines", "adaptive indexing", "bitmap indexes", "spatial indexes"],
        ctx=["for distributed databases", "on modern SSD hardware", "for analytical workloads", "in cloud-native systems", "under skewed workloads"],
        body="We study how {s} accelerate lookups and range scans. Our approach reduces read amplification and tail latency, and we evaluate it on OLTP and OLAP benchmarks."),
    "Distributed Systems": dict(
        kw=["consensus", "replication", "distributed transactions", "fault tolerance", "sharding"],
        subj=["Raft-based consensus", "geo-replication", "distributed transactions", "partitioning schemes", "leaderless replication", "eventual consistency"],
        ctx=["in geo-distributed clusters", "with network partitions", "for large-scale cloud storage", "at low latency", "under failures"],
        body="This paper presents {s} for scalable distributed data stores. We prove safety properties and show high throughput and fault tolerance across data centers."),
    "Machine Learning": dict(
        kw=["deep learning", "neural networks", "optimization", "representation learning", "generalization"],
        subj=["deep neural networks", "stochastic gradient methods", "self-supervised learning", "regularization techniques", "attention architectures", "contrastive learning"],
        ctx=["with limited labels", "for image classification", "at scale", "with theoretical guarantees", "on noisy data"],
        body="We propose improvements to {s} that boost generalization and training stability. Experiments on standard benchmarks show consistent gains over strong baselines."),
    "Natural Language Processing": dict(
        kw=["transformers", "language models", "embeddings", "text classification", "machine translation"],
        subj=["transformer language models", "sentence embeddings", "neural machine translation", "question answering", "text summarization", "named entity recognition"],
        ctx=["for low-resource languages", "with pretraining", "in multilingual settings", "using prompts", "for scientific text"],
        body="We investigate {s} using large pretrained corpora. Results demonstrate better semantic understanding and robustness on downstream text tasks."),
    "Computer Vision": dict(
        kw=["object detection", "segmentation", "convolutional networks", "image recognition", "vision transformers"],
        subj=["object detection", "semantic segmentation", "vision transformers", "image generation", "pose estimation", "video understanding"],
        ctx=["in real time", "on edge devices", "with few examples", "for autonomous driving", "under occlusion"],
        body="We introduce a new method for {s} that improves accuracy of visual recognition. It is evaluated on public image datasets and runs efficiently on GPUs."),
    "Computer Security": dict(
        kw=["cryptography", "privacy", "malware", "authentication", "differential privacy"],
        subj=["differential privacy", "secure multi-party computation", "malware detection", "authentication protocols", "side-channel attacks", "intrusion detection"],
        ctx=["in cloud environments", "for mobile apps", "against adaptive adversaries", "with formal verification", "in IoT networks"],
        body="We analyse {s} and design defenses against realistic attackers. Our implementation provides strong privacy and security guarantees with small overhead."),
    "Graph Analytics": dict(
        kw=["graph neural networks", "pagerank", "community detection", "knowledge graphs", "graph databases"],
        subj=["graph neural networks", "PageRank computation", "community detection", "knowledge graph embeddings", "subgraph matching", "graph databases"],
        ctx=["on billion-edge graphs", "in streaming settings", "with property graphs", "for recommendation", "using GPUs"],
        body="We present scalable algorithms for {s} on large networks. Traversals and citation or social graph queries are significantly faster than existing systems."),
    "Information Retrieval": dict(
        kw=["semantic search", "vector search", "ranking", "recommender systems", "approximate nearest neighbor"],
        subj=["approximate nearest neighbor search", "dense retrieval", "learning to rank", "vector databases", "recommender systems", "query expansion"],
        ctx=["with HNSW graphs", "for large document collections", "using embeddings", "with hybrid keyword search", "at web scale"],
        body="This work addresses {s} for finding relevant documents. By embedding text into vectors and comparing similarity we improve recall and ranking quality."),
    "Operating Systems": dict(
        kw=["scheduling", "virtualization", "file systems", "memory management", "kernel"],
        subj=["CPU scheduling", "virtual memory", "file systems", "containers and virtualization", "kernel bypass I/O", "persistent memory"],
        ctx=["on multicore processors", "in data centers", "for real-time workloads", "with low overhead", "on NVMe storage"],
        body="We redesign {s} to reduce latency and improve utilization. The prototype is implemented in the kernel and evaluated on multicore servers."),
    "Software Engineering": dict(
        kw=["testing", "program analysis", "code review", "bug detection", "devops"],
        subj=["automated testing", "static program analysis", "code review practices", "bug localization", "continuous integration", "program repair"],
        ctx=["in large codebases", "using machine learning", "for microservices", "in open-source projects", "with formal specs"],
        body="We study {s} to improve software quality. An empirical study of real projects shows our technique finds more defects with fewer false positives."),
    "Data Mining": dict(
        kw=["clustering", "anomaly detection", "frequent patterns", "time series", "stream processing"],
        subj=["clustering algorithms", "anomaly detection", "frequent pattern mining", "time series forecasting", "stream processing", "feature selection"],
        ctx=["in high dimensions", "for sensor data", "in real time", "with concept drift", "on big data platforms"],
        body="We develop efficient methods for {s} over massive datasets. Experiments show improved accuracy and lower memory footprint than prior work."),
}

CONFS = [("International Conference on Very Large Data Bases", "VLDB", "Databases", "A*"),
         ("ACM SIGMOD Conference", "SIGMOD", "Databases", "A*"),
         ("Symposium on Operating Systems Principles", "SOSP", "Systems", "A*"),
         ("USENIX Symposium on Networked Systems Design", "NSDI", "Systems", "A"),
         ("Conference on Neural Information Processing Systems", "NeurIPS", "Machine Learning", "A*"),
         ("International Conference on Machine Learning", "ICML", "Machine Learning", "A*"),
         ("Association for Computational Linguistics", "ACL", "NLP", "A*"),
         ("Conference on Computer Vision and Pattern Recognition", "CVPR", "Vision", "A*"),
         ("ACM Conference on Computer and Communications Security", "CCS", "Security", "A*"),
         ("ACM SIGIR Conference", "SIGIR", "Information Retrieval", "A*"),
         ("International Conference on Software Engineering", "ICSE", "Software Engineering", "A*"),
         ("ACM SIGKDD Conference", "KDD", "Data Mining", "A*"),
         ("The Web Conference", "WWW", "Web", "A"),
         ("International Conference on Data Engineering", "ICDE", "Databases", "A")]

TOPIC_CONFS = {"Database Indexing": ["VLDB", "SIGMOD", "ICDE"], "Distributed Systems": ["SOSP", "NSDI", "VLDB"],
               "Machine Learning": ["NeurIPS", "ICML"], "Natural Language Processing": ["ACL", "NeurIPS"],
               "Computer Vision": ["CVPR", "NeurIPS"], "Computer Security": ["CCS", "NSDI"],
               "Graph Analytics": ["VLDB", "KDD", "WWW"], "Information Retrieval": ["SIGIR", "WWW", "KDD"],
               "Operating Systems": ["SOSP", "NSDI"], "Software Engineering": ["ICSE"], "Data Mining": ["KDD", "ICDE"]}

INSTS = [("IISc Bangalore", "India", "Bangalore"), ("IIT Bombay", "India", "Mumbai"), ("IIT Delhi", "India", "Delhi"),
         ("PES University", "India", "Bangalore"), ("MIT", "USA", "Cambridge"), ("Stanford University", "USA", "Stanford"),
         ("UC Berkeley", "USA", "Berkeley"), ("Carnegie Mellon University", "USA", "Pittsburgh"),
         ("ETH Zurich", "Switzerland", "Zurich"), ("University of Oxford", "UK", "Oxford"),
         ("Tsinghua University", "China", "Beijing"), ("NUS", "Singapore", "Singapore")]

FIRST = ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Meera", "Arjun", "Sneha", "Kiran", "Divya", "Rahul", "Neha",
         "John", "Emily", "Wei", "Li", "Hannah", "Lucas", "Sofia", "Daniel", "Yuki", "Chen", "Marta", "Omar", "Elena", "Noah"]
LAST = ["Sharma", "Iyer", "Reddy", "Nair", "Gupta", "Kulkarni", "Rao", "Menon", "Smith", "Johnson", "Zhang", "Wang",
        "Müller", "Rossi", "Tanaka", "Kim", "Singh", "Patel", "Brown", "Garcia", "Khan", "Novak", "Lee", "Dubois"]


def make_paper(topic, spec):
    s = random.choice(spec["subj"])
    ctx = random.choice(spec["ctx"])
    title = random.choice([f"Efficient {s} {ctx}", f"Scalable {s} {ctx}", f"Rethinking {s} {ctx}",
                           f"A Study of {s} {ctx}", f"Towards Robust {s} {ctx}", f"Learning-Based {s} {ctx}"])
    abstract = spec["body"].format(s=s) + f" The setting considered is: {s} {ctx}. " + \
        "We release code and data to support reproducibility."
    return title[0].upper() + title[1:], abstract


def main():
    print("Loading embedding model...")
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

    topics = list(TOPICS)
    # researchers: each has a primary topic
    researchers = []
    used = set()
    while len(researchers) < 60:
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        if name in used:
            continue
        used.add(name)
        researchers.append(dict(name=name, topic=random.choice(topics), inst=random.randint(1, len(INSTS)),
                                h=random.randint(2, 45)))
    # papers
    papers = []
    for i in range(220):
        t = random.choice(topics)
        title, abstract = make_paper(t, TOPICS[t])
        papers.append(dict(id=i + 1, topic=t, title=title, abstract=abstract, year=random.randint(2005, 2025),
                           conf=random.choice(TOPIC_CONFS[t]), kws=random.sample(TOPICS[t]["kw"], 3)))
    papers.sort(key=lambda p: p["year"])
    for i, p in enumerate(papers):
        p["id"] = i + 1
    # authorship: 1-4 authors, mostly same-topic researchers
    for p in papers:
        pool = [i for i, r in enumerate(researchers) if r["topic"] == p["topic"]]
        n = random.randint(1, 4)
        authors = random.sample(pool, min(n, len(pool)))
        if random.random() < 0.2:
            authors.append(random.randrange(len(researchers)))
        p["authors"] = list(dict.fromkeys(authors))
    # citations: cite earlier papers, preferential attachment, mostly same topic
    cites = set()
    indeg = {p["id"]: 1 for p in papers}
    for p in papers:
        earlier = [q for q in papers if q["year"] <= p["year"] and q["id"] != p["id"]]
        if not earlier:
            continue
        for _ in range(random.randint(2, 7)):
            same = [q for q in earlier if q["topic"] == p["topic"]]
            pool = same if same and random.random() < 0.8 else earlier
            w = [indeg[q["id"]] for q in pool]
            tgt = random.choices(pool, weights=w)[0]
            if (p["id"], tgt["id"]) not in cites:
                cites.add((p["id"], tgt["id"]))
                indeg[tgt["id"]] += 1

    print("Embedding abstracts (title + abstract + keywords)...")
    texts = [f"{p['title']}. {p['abstract']} Keywords: {', '.join(p['kws'])}" for p in papers]
    emb = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)

    # ---------------------------------------------------------------- PostgreSQL
    with psycopg.connect(PG_DSN) as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE audit_log, citation, paper_keyword, publication, keyword, paper, conference, "
                    "app_user, researcher, institution RESTART IDENTITY CASCADE")
        for n, c, city in INSTS:
            cur.execute("INSERT INTO institution(name,country,city) VALUES (%s,%s,%s)", (n, c, city))
        for n, a, f, r in CONFS:
            cur.execute("INSERT INTO conference(name,acronym,field,rank) VALUES (%s,%s,%s,%s)", (n, a, f, r))
        conf_id = {a: i + 1 for i, (_, a, _, _) in enumerate(CONFS)}
        for i, r in enumerate(researchers):
            email = r["name"].lower().replace(" ", ".").replace("ü", "u") + f"{i}@univ.edu"
            cur.execute("INSERT INTO researcher(full_name,email,institution_id,research_area,h_index) VALUES (%s,%s,%s,%s,%s)",
                        (r["name"], email, r["inst"], r["topic"], r["h"]))
        for p, e in zip(papers, emb):
            cur.execute("INSERT INTO paper(title,abstract,pub_year,conference_id,doi,embedding) VALUES (%s,%s,%s,%s,%s,%s) RETURNING paper_id",
                        (p["title"], p["abstract"], p["year"], conf_id[p["conf"]], f"10.1000/rip.{p['year']}.{p['id']}",
                         "[" + ",".join(f"{x:.6f}" for x in e) + "]"))
            assert cur.fetchone()[0] == p["id"]
            for order, a in enumerate(p["authors"], 1):
                cur.execute("INSERT INTO publication VALUES (%s,%s,%s)", (p["id"], a + 1, order))
            for k in p["kws"]:
                cur.execute("INSERT INTO keyword(term) VALUES (%s) ON CONFLICT DO NOTHING", (k.lower(),))
                cur.execute("INSERT INTO paper_keyword SELECT %s, keyword_id FROM keyword WHERE term=%s", (p["id"], k.lower()))
        for a, b in sorted(cites):
            cur.execute("INSERT INTO citation VALUES (%s,%s)", (a, b))  # triggers update citation_count
        pw = lambda s: bcrypt.hashpw(s.encode(), bcrypt.gensalt()).decode()
        cur.execute("INSERT INTO app_user(email,password_hash,role) VALUES (%s,%s,'admin')", ("admin@demo.com", pw("admin123")))
        cur.execute("INSERT INTO app_user(email,password_hash,role,researcher_id) VALUES (%s,%s,'researcher',1)",
                    ("researcher@demo.com", pw("research123")))
        conn.commit()
        cur.execute("SELECT paper_id, citation_count FROM paper")
        counts = dict(cur.fetchall())
    print(f"PostgreSQL: {len(papers)} papers, {len(cites)} citations")

    # ---------------------------------------------------------------- Neo4j
    driver = GraphDatabase.driver(NEO_URI, auth=NEO_AUTH)
    with driver.session() as s:
        s.run("MATCH (n) DETACH DELETE n")
        s.run("CREATE CONSTRAINT paper_id IF NOT EXISTS FOR (p:Paper) REQUIRE p.paper_id IS UNIQUE")
        s.run("CREATE CONSTRAINT researcher_id IF NOT EXISTS FOR (r:Researcher) REQUIRE r.researcher_id IS UNIQUE")
        s.run("CREATE CONSTRAINT inst_id IF NOT EXISTS FOR (i:Institution) REQUIRE i.institution_id IS UNIQUE")
        s.run("UNWIND $rows AS r MERGE (i:Institution {institution_id:r.id}) SET i.name=r.name",
              rows=[dict(id=i + 1, name=n) for i, (n, _, _) in enumerate(INSTS)])
        s.run("UNWIND $rows AS r MERGE (x:Researcher {researcher_id:r.id}) SET x.name=r.name, x.area=r.area "
              "WITH x, r MATCH (i:Institution {institution_id:r.inst}) MERGE (x)-[:WORKS_AT]->(i)",
              rows=[dict(id=i + 1, name=r["name"], area=r["topic"], inst=r["inst"]) for i, r in enumerate(researchers)])
        s.run("UNWIND $rows AS r MERGE (p:Paper {paper_id:r.id}) SET p.title=r.title, p.year=r.year, p.topic=r.topic",
              rows=[dict(id=p["id"], title=p["title"], year=p["year"], topic=p["topic"]) for p in papers])
        s.run("UNWIND $rows AS r MATCH (a:Researcher {researcher_id:r.a}), (p:Paper {paper_id:r.p}) MERGE (a)-[:AUTHORED]->(p)",
              rows=[dict(a=a + 1, p=p["id"]) for p in papers for a in p["authors"]])
        s.run("UNWIND $rows AS r MATCH (a:Paper {paper_id:r.a}), (b:Paper {paper_id:r.b}) MERGE (a)-[:CITES]->(b)",
              rows=[dict(a=a, b=b) for a, b in cites])
        # COLLABORATED_WITH derived from co-authorship
        s.run("MATCH (a:Researcher)-[:AUTHORED]->(p:Paper)<-[:AUTHORED]-(b:Researcher) WHERE a.researcher_id < b.researcher_id "
              "WITH a, b, count(p) AS w MERGE (a)-[c:COLLABORATED_WITH]->(b) SET c.papers = w")
        # RELATED_TO derived from embedding similarity (top-3 neighbours, cosine >= 0.5)
        sim = emb @ emb.T
        rel = []
        for i in range(len(papers)):
            order = np.argsort(-sim[i])
            for j in [x for x in order if x != i][:3]:
                if sim[i, j] >= 0.5:
                    rel.append(dict(a=papers[i]["id"], b=papers[j]["id"], s=float(sim[i, j])))
        s.run("UNWIND $rows AS r MATCH (a:Paper {paper_id:r.a}), (b:Paper {paper_id:r.b}) MERGE (a)-[x:RELATED_TO]->(b) SET x.score=r.s",
              rows=rel)
    driver.close()
    print("Neo4j graph loaded. Demo logins: admin@demo.com/admin123, researcher@demo.com/research123")


if __name__ == "__main__":
    main()
