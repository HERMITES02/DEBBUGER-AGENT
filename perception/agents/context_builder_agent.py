import sys
import asyncio
import json
import os
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

from shared.schema import DebugRequest, AgentMessage
from dotenv import load_dotenv
from anthropic import Anthropic
from redis import Redis
from perception.memory.vector_store import search_similar_bugs, store_session

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

redis_client = Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    password=os.getenv("REDIS_PASSWORD", None),
    decode_responses=True
)

    

SYSTEM_PROMPT = """
You are a context assembly agent. Your job is to take 
multiple sources of information about a bug and combine 
them into one clear, structured debug brief.

You will receive:
- Vision agent findings (error extracted from screenshot)
- Code analysis findings (lint errors, AST, bug classification)
- User's description of the problem
- Terminal logs if available
- Similar past bugs from memory if available

Produce a final debug brief in this JSON format:
{
  "assembled_prompt": "complete description of the bug for the patch agent",
  "bug_summary": "one line summary of the bug",
  "primary_cause": "root cause of the bug",
  "relevant_context": "any additional context that helps fix it",
  "confidence": 0.95
}

Return ONLY the JSON object.
No explanation, no markdown, no backticks.
If information is missing or unclear, still return 
JSON with best effort and lower confidence.

"""

async def get_agent_results(session_id: str) -> dict:
    loop = asyncio.get_event_loop()
     
    vision_result = await loop.run_in_executor(
        None,
        lambda: redis_client.blpop(f"results:{session_id}:vision", timeout=10)
    )
    
    code_result = await loop.run_in_executor(
        None,
        lambda: redis_client.blpop(f"results:{session_id}:code", timeout=10)
    )
    
    print(f"vision_result: {vision_result}")
    print(f"code_result: {code_result}")
    
    return {
        "vision": json.loads(vision_result[1]) if vision_result else None,
        "code": json.loads(code_result[1]) if code_result else None
    }



def assemble_with_claude(vision_findings, code_findings, user_message, logs, similar) -> dict:
    try:
        response =  client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"""
                    Vision findings: {json.dumps(vision_findings)}
                    Code findings: {json.dumps(code_findings)}
                    User description: {user_message}
                    Terminal logs: {logs}
                    Similar past bugs: {json.dumps(similar)}
                    """
                }
            ]
        )
        raw_text = response.content[0].text
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```json")[-1].split("```")[0].strip()
        return json.loads(raw_text)
    except Exception as e:
        print(f"[context_builder] Claude API error: {e}")
        return {
            "assembled_prompt": user_message,
            "bug_summary": None,
            "primary_cause": None,
            "relevant_context": None,
            "confidence": 0.0
        }

async def run_context_builder_agent(request: DebugRequest) -> dict:
    print("[context_builder] starting...") 
    results = await get_agent_results(request.session_id)
    vision_findings = results["vision"]
    code_findings = results["code"]

    try:
        similar = search_similar_bugs(request.user_message)
    except Exception as e:
        print(f"[context_builder] ChromaDB search failed: {e}")
        similar = []

    claude_result = assemble_with_claude(
        vision_findings, code_findings, 
        request.user_message, request.logs, similar
    )


    store_session(
        request.session_id,
        claude_result,
        request.user_message
    )
    
    msg= AgentMessage(
        session_id=request.session_id,
        type="context_assembled",
        agent_id="context_builder_agent",
        content=claude_result,
        confidence=claude_result.get("confidence", 0.0)
     )
    try:
        subscribers = redis_client.publish("agent_messages", msg.model_dump_json())
        print(f"[context_builder_agent] ✅ Published to Redis — {subscribers} subscribers listening")
    except Exception as e:
        print(f"[context_builder_agent] ❌ Redis publish failed: {e}")
    return claude_result


if __name__ == "__main__":
    import asyncio
    
    # fake session id
    session_id = "test-session-453"
    
    # manually push fake vision agent result
    fake_vision = json.dumps({
        "agent_id": "vision_agent",
        "type": "error_extracted",
        "content": {"error_type": "ZeroDivisionError", "error_message": "division by zero"},
        "session_id": session_id,
        "confidence": 0.95
    })
    r1=redis_client.rpush(f"results:{session_id}:vision", fake_vision)
    print(f"pushed vision={r1}")
    # manually push fake code analysis result
    fake_code = json.dumps({
        "agent_id": "code_analysis_agent",
        "type": "code_analyzed",
        "content": {"bug_classification": "ZeroDivisionError", "affected_functions": ["calc"]},
        "session_id": session_id,
        "confidence": 0.90
    })
    r2=redis_client.rpush(f"results:{session_id}:code", fake_code)
    print(f"pushed code={r2}")
    # now run context builder
    test_request = DebugRequest(
        user_message="my code crashes when i pass 0",
        code="def calc(a,b):\n    return a/b",
        language="python",
        session_id=session_id
    )

    check = redis_client.llen(f"results:{session_id}:vision")
    print(f"items in vision list: {check}")
    check = redis_client.llen(f"results:{session_id}:code")
    print(f"items in code list: {check}")

    result = asyncio.run(run_context_builder_agent(test_request))
    print(result)