from celery import Celery
import os
from dotenv import load_dotenv
load_dotenv()

celery_app = Celery(
    "debug_agent",
    broker=os.getenv("REDIS_URL"),
    backend=os.getenv("REDIS_URL"),
)

@celery_app.task
def execute_code_task(code: str, language: str = "python") -> dict:
    import asyncio
    from tools.sandbox import execute_code
    return asyncio.run(execute_code(code, language))