
import asyncio, base64, re, sys
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# Allow running standalone OR imported from project root
_root = str(Path(__file__).resolve().parents[2])
if _root not in sys.path:
    sys.path.insert(0, _root)

from shared.schema import DebugRequest, AgentMessage
from perception.agents.vision_agent import run_vision_agent
from perception.agents.run_code_analysis_agent import run_code_analysis_agent
from perception.agents.context_builder_agent import run_context_builder_agent

import json
import redis.asyncio as aioredis
import os
from dotenv import load_dotenv
load_dotenv()



def classify(request: DebugRequest) -> list[dict]:
    modalities = []
    modalities.append({"type": "code", "language": request.language})
    if request.images:
        modalities.append({"type": "images", "count":len(request.images)})
    if request.logs:
        modalities.append({"type": "logs"})
    if request.description:
        modalities.append({"type": "description"})
    return modalities

def encode_image(image_data)-> str:
    if isinstance(image_data, str):
        return image_data
    return base64.b64encode(image_data).decode("utf-8")

def preprocess_images(images: list) -> list[str]:
    return [encode_image(image) for image in images]

def strip_ansi(text:str)->str:
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
    return ansi_escape.sub('', text).strip()

async def dispatch(request: DebugRequest) -> list:
    perception_tasks = []

    if request.images:
        perception_tasks.append(run_vision_agent(request))

    if request.code:                              # ← only runs if code pasted
        perception_tasks.append(run_code_analysis_agent(request))

    if perception_tasks:
        perception_results = await asyncio.gather(
            *perception_tasks, return_exceptions=True
        )
        print(f"[router] perception done: {len(perception_results)} agents")
    else:
        print("[router] no images or code — skipping perception")
        perception_results = []

    if request.images or request.code:
        context_result = await run_context_builder_agent(request)
    else:
        context_result = None

    return [r for r in perception_results if r is not None and not isinstance(r, Exception)]

async def route_final(request: DebugRequest) -> dict:
    print(f"[router] session: {request.session_id}")
    modalities = classify(request)

    if request.images:
        request.images = preprocess_images(request.images)
    if request.logs:
        request.logs = strip_ansi(request.logs)

    results = await dispatch(request)

    # ── extract agent results from perception output ───────────────────────
    vision_result = None
    code_result   = None

    for r in results:
        if not r or not isinstance(r, dict):
            continue
        agent_id = r.get("agent_id", "")
        content  = r.get("content", {})

        if agent_id == "vision_agent":
            extractions = content.get("extractions", []) if isinstance(content, dict) else []
            if extractions:
                # merge all extractions into one — use highest confidence one
                best = max(extractions, key=lambda x: x.get("confidence", 0))
                vision_result = best
                print(f"[router] vision_result extracted: {vision_result.get('error_type')}, conf={vision_result.get('confidence')}")

        elif agent_id == "code_analysis_agent":
            code_result = content if isinstance(content, dict) else {}

    return {
        "session_id":          request.session_id,
        "modalities_detected": modalities,
        "agents_fired":        len(results),
        "context":             results[0] if results else None,
        "vision_result":       vision_result,   # ← now top-level
        "code_result":         code_result,     # ← now top-level
    }

app = FastAPI()

_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/route")
async def route_endpoint(request: DebugRequest):
    return await route_final(request)
    
@app.get("/health")
async def health():
    return {"status": "ok", "service": "input_router"}

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"[router] WebSocket connected — session: {session_id}")

    # Async Redis client — won't block the event loop
    r = aioredis.from_url(os.getenv("REDIS_URL"), decode_responses=True)
    pubsub = r.pubsub()

    # Subscribe to the session-specific channel
    # ← was: "agent_messages" (global, wrong)
    await pubsub.subscribe(f"agent:events:{session_id}")

    try:
        async for message in pubsub.listen():     # ← async for, not for
            if message["type"] != "message":
                continue

            data = json.loads(message["data"])
            await websocket.send_text(json.dumps(data))

            # Stop when orchestrator signals done
            if data.get("type") == "done":
                break

    except Exception as e:
        print(f"[router] WebSocket error: {e}")

    finally:
        await pubsub.unsubscribe(f"agent:events:{session_id}")
        await r.aclose()
        print(f"[router] WebSocket closed — session: {session_id}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("input_router:app", host="0.0.0.0", port=8001, reload=True)