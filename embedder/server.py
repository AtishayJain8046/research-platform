"""Local embedding service: all-MiniLM-L6-v2 (384-dim, L2-normalised)."""
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
app = FastAPI()


class Req(BaseModel):
    texts: list[str]


@app.post("/embed")
def embed(req: Req):
    vecs = model.encode(req.texts, normalize_embeddings=True)
    return {"embeddings": vecs.tolist()}
