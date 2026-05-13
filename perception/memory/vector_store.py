import os
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

from dotenv import load_dotenv
load_dotenv()

def search_similar_bugs(description: str) -> list:
    # ChromaDB temporarily disabled on Windows
    # re-enable after deployment on Linux
    return []

def store_session(session_id: str, claude_result: dict, user_message: str):
    # ChromaDB temporarily disabled on Windows
    print(f"[vector_store] skipping — ChromaDB disabled on Windows")
    return

def get_collection():
    return None