import os, json
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).resolve().parents[2]))
from dotenv import load_dotenv
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

load_dotenv()

# Persistent — survives restarts. Stored in project root/chroma_db/
DB_PATH = str(Path(__file__).resolve().parents[2] / "chroma_db")

chroma_client = chromadb.PersistentClient(path=DB_PATH)

embedding_fn = SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"  # free, fast, good enough for bug similarity
)

collection = chroma_client.get_or_create_collection(
    "debug_sessions",
    embedding_function=embedding_fn
)

def search_similar_bugs(description: str) -> list[dict]:
    """Find past bugs similar to this description."""
    if not description or not description.strip():
        return []
    try:
        results = collection.query(
            query_texts=[description],
            n_results=2
        )
        docs = results.get("documents", [[]])[0]
        return docs if docs else []
    except Exception as e:
        print(f"[vector_store] search failed: {e}")
        return []

def store_session(session_id: str, claude_result: dict, user_message: str):
    """Store a debug session for future similarity search."""
    description = f"""
Bug summary: {claude_result.get('bug_summary', '')}
Primary cause: {claude_result.get('primary_cause', '')}
Relevant context: {claude_result.get('relevant_context', '')}
User description: {user_message}
    """.strip()

    if not description:
        return
    try:
        # Use upsert so re-running same session_id doesn't crash
        collection.upsert(
            documents=[description],
            ids=[session_id]
        )
        print(f"[vector_store] stored session {session_id}")
    except Exception as e:
        print(f"[vector_store] store warning: {e}")

def get_collection():
    return collection