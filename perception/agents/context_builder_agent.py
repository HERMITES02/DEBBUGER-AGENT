import sys, asyncio, json, os
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[2]))

from anthropic import AsyncAnthropic          # ← async
import redis.asyncio as aioredis             # ← async
from dotenv import load_dotenv
from shared.schema import DebugRequest
from tools.redis_publisher import publish_agent_event
from perception.memory.vector_store import search_similar_bugs, store_session

load_dotenv()

client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """
You are a context assembly agent. Combine all bug information
into one clear debug brief.

Respond ONLY with this JSON:
{
  "assembled_prompt": "complete description for the patch agent",
  "bug_summary": "one line summary",
  "primary_cause": "root cause",
  "relevant_context": "additional context",
  "confidence": 0.95
}
No markdown, no backticks. Raw JSON only.
"""

async def get_redis():
    return aioredis.from_url(
        os.getenv("REDIS_URL", "redis://localhost:6379"),
        decode_responses=True
    )

async def get_agent_results(session_id: str) -> dict:
    """
    Read vision + code results from Redis lists.
    Vision agent and code agent must rpush to:
       results:{session_id}:vision
       results:{session_id}:code
    before context builder runs.
    """
    r = await get_redis()
    try:
        # blpop with 15s timeout — waits for agents to finish
        vision_raw = await r.blpop(
            f"results:{session_id}:vision", timeout=15
        )
        code_raw = await r.blpop(
            f"results:{session_id}:code", timeout=15
        )
        return {
            "vision": json.loads(vision_raw[1]) if vision_raw else None,
            "code":   json.loads(code_raw[1])   if code_raw   else None,
        }
    finally:
        await r.aclose()

async def assemble_with_claude(
    vision_findings, code_findings,
    user_message, logs, similar
) -> dict:
    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",   # ← correct model string
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"""
Vision findings: {json.dumps(vision_findings)}
Code findings: {json.dumps(code_findings)}
User description: {user_message}
Terminal logs: {logs}
Similar past bugs: {json.dumps(similar)}
"""
            }]
        )
        raw = response.content[0].text.strip()
        # Strip markdown fences if Claude adds them
        if raw.startswith("```"):
            raw = raw.split("```json")[-1].split("```")[0].strip()
        return json.loads(raw)
    except Exception as e:
        print(f"[context_builder] Claude error: {e}")
        return {
            "assembled_prompt": user_message,
            "bug_summary": None,
            "primary_cause": None,
            "relevant_context": None,
            "confidence": 0.0
        }

async def run_context_builder_agent(request: DebugRequest) -> dict:
    print("[context_builder] starting...")
    sid = request.session_id or "default-session"

    await publish_agent_event(
        sid, "context_builder_agent", "thinking",
        "Assembling context from all perception agents..."
    )

    results = await get_agent_results(sid)
    vision_findings = results["vision"]
    code_findings   = results["code"]

    try:
        similar = search_similar_bugs(request.user_message)
    except Exception as e:
        print(f"[context_builder] vector search failed: {e}")
        similar = []

    claude_result = await assemble_with_claude(
        vision_findings, code_findings,
        request.user_message, request.logs, similar
    )

    # Store in vector DB for future sessions
    store_session(sid, claude_result, request.user_message)

    # Publish result — correct channel name
    await publish_agent_event(
        sid, "context_builder_agent", "result",
        json.dumps(claude_result),
        confidence=claude_result.get("confidence", 0.0)
    )

    print(f"[context_builder] done — confidence: {claude_result.get('confidence')}")
    return claude_result