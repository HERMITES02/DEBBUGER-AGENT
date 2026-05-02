import os
import json
from pathlib import Path
import sys


sys.path.append(str(Path(__file__).resolve().parents[2]))

from dotenv import load_dotenv
import chromadb
import voyageai
from chromadb.utils.embedding_functions import EmbeddingFunction

load_dotenv()

class VoyageEmbedding(EmbeddingFunction):
    def __init__(self):
        self.vo = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
    
    def __call__(self, input):
        result = self.vo.embed(input, model="voyage-3-lite")
        return result.embeddings
    

chroma_client = chromadb.Client()
collection = chroma_client.get_or_create_collection(
    "debug_sessions",
    embedding_function=VoyageEmbedding()
)

def search_similar_bugs(description: str) -> list[dict]:
    if not description:
        return []
    results = collection.query(
        query_texts=[description],
        n_results=2       
    )
    return results['documents'][0] if results and 'documents' in results and len(results['documents']) > 0 else []


def store_session(session_id: str, claude_result: dict, user_message: str):


    description = f"""
        Bug summary: {claude_result.get('bug_summary', '')}
        Primary cause: {claude_result.get('primary_cause', '')}
        Relevant context: {claude_result.get('relevant_context', '')}
        User description: {user_message}
    """.strip()


    
    if not description:
        return
    
    try:

        collection.add(
            documents=[description],
            ids=[session_id]
        )


        print(f"[vector_store] stored session {session_id} in ChromaDB")
    except Exception as e:
        print(f"[vector_store] ChromaDB store warning: {e}")


def get_collection():
    return collection