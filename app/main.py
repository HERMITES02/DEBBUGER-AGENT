from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional 
from tools.redis_publisher import close_redis, get_redis
from contextlib import asynccontextmanager
from app.auth.routes import router as auth_router
from app.images.routes import images_router as images_router
from app.auth.models import init_db
from app.auth.jwt import get_current_user
from app.memory.session_store import save_session, get_user_context
from app.scoring.confidence import calculate_confidence
from dotenv import load_dotenv
import json, os
import redis.asyncio as aioredis
from app.auth.jwt import get_current_user_optional 

load_dotenv()

from shared.schema import DebugRequest, DebugResult
from agents.orchestrator import orchestrator

from pydantic import BaseModel

class SaveSessionRequest(BaseModel):
    session_id:  str
    root_cause:  str = ""
    patch:       str = ""
    explanation: str = ""
    tests:       list[str] = []
    confidence:  float = 0.0
    code:        str = ""
    language:    str = "python"
    user_message:str = ""
    images:      list[str] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    print("[startup] Database tables created")
    try:
        r = await get_redis()
        await r.ping()
        print("[startup] Redis connection OK")
    except Exception as e:
        print(f"[startup] WARNING: Redis not reachable — {e}")

    yield

    # Shutdown
    await close_redis()
    print("[shutdown] Redis connection closed")

app = FastAPI(title="Debug Agent API", version="0.1.0", lifespan=lifespan)

from fastapi.responses import JSONResponse
import traceback

_cors_raw = os.getenv("CORS_ORIGINS") or os.getenv("CORS_ORIGIN") or "http://localhost:3000"
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
print(f"[startup] CORS origins loaded: {_cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    print(f"[error] Unhandled exception on {request.url.path}: {exc}")
    traceback.print_exc()
    origin = request.headers.get("origin") or "*"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server Error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
    )

app.include_router(auth_router)
app.include_router(images_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

# ── /debug — protected, with memory + confidence ──────────────────────────────
@app.post("/debug", response_model=DebugResult)
async def debug(
    req:          DebugRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)  # ← auth here, NOT nested
):
    user_id = current_user["sub"] if current_user else None
    print(f"[debug] user: {user_id or 'anonymous'}")

    user_context = await get_user_context(user_id) if user_id else []

    result = await orchestrator.ainvoke({
        "messages":          [],
        "user_request":      req.user_message,
        "root_cause":        "",
        "patch":             "",
        "done":              False,
        "session_id":        req.session_id or "default-session",
        "code":              req.code,
        "logs":              req.logs,
        "language":          req.language,
        "images":            req.images,
        "modalities":        None,
        "search_results":    None,
        "sandbox_result":    None,
        "patch_diff":        None,
        "patch_explanation": None,
        "test_code":         None,
        "tests_passed":      None,
        "test_output":       None,
        "vision_result":     None,
        "code_analysis":     None,
        "context_summary":   None,
        "user_id":           user_id,
        "user_context":      user_context,   # ← past sessions
        "confidence":     None,  
    })

    # Real multi-factor confidence score
    confidence = result.get("confidence", 0.0)

    debug_result = DebugResult(
        session_id=  req.session_id or "default-session",
        root_cause=  result["root_cause"],
        patch=       result.get("patch_diff") or "",
        explanation= result.get("patch_explanation") or "",
        tests=       [result["test_code"]] if result.get("test_code") else [],
        confidence=  confidence,
        images=      req.images,
        user_message=req.user_message,
        code=        req.code,
        language=    req.language,
        request=     {"code": req.code, "user_message": req.user_message},
    )

    # Save session under this user for future memory
    if user_id:
        await save_session(
            user_id=    user_id,
            session_id= req.session_id or "default-session",
            result=     result,
            request=    req.model_dump(),
        )
    return debug_result

# ── Session history endpoints ─────────────────────────────────────────────────

@app.post("/sessions/save")
async def save_current_session(
    req:          SaveSessionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Explicitly save the current session result before starting a new one.
    Call this from the frontend when user clicks '+ new session'.
    """
    user_id = current_user["sub"]

    await save_session(
        user_id=    user_id,
        session_id= req.session_id,
        result={
            "root_cause":        req.root_cause,
            "patch_diff":        req.patch,
            "patch_explanation": req.explanation,
            "test_code":         req.tests[0] if req.tests else None,
            "confidence":        req.confidence,
        },
        request={
            "code":         req.code,
            "language":     req.language,
            "user_message": req.user_message,
            "images":       req.images,
        }
    )
    return {"saved": True, "session_id": req.session_id}

@app.get("/sessions")
async def get_sessions(current_user: dict = Depends(get_current_user)):
    from app.memory.session_store import get_user_sessions
    sessions = await get_user_sessions(current_user["sub"])
    return {"sessions": sessions}

@app.get("/sessions/{session_id}")
async def get_session(
    session_id:   str,
    current_user: dict = Depends(get_current_user)
):
    from app.memory.session_store import get_session_result
    from fastapi import HTTPException
    result = await get_session_result(session_id)
    if not result:
        raise HTTPException(404, "Session not found")
    return result

# ── WebSocket — live agent streaming ─────────────────────────────────────────
@app.websocket("/ws/debug")
async def ws_debug(ws: WebSocket):
    await ws.accept()
    r_pubsub = aioredis.from_url(os.getenv("REDIS_URL"), decode_responses=True)
    pubsub = r_pubsub.pubsub()
    try:
        data = await ws.receive_text()
        req = DebugRequest(**json.loads(data))
        session_id = req.session_id or "default-session"

        await pubsub.subscribe(f"agent:events:{session_id}")

        import asyncio

        async def run_orchestrator():
            await orchestrator.ainvoke({
                "messages":          [],
                "user_request":      req.user_message,
                "root_cause":        "",
                "patch":             "",
                "done":              False,
                "session_id":        session_id,
                "code":              req.code,
                "logs":              req.logs,
                "language":          req.language,
                "images":            req.images,
                "modalities":        None,
                "search_results":    None,
                "sandbox_result":    None,
                "patch_diff":        None,
                "patch_explanation": None,
                "test_code":         None,
                "tests_passed":      None,
                "test_output":       None,
                "vision_result":     None,
                "code_analysis":     None,
                "context_summary":   None,
                "user_id":           None,
                "user_context":      None,
            })
            r_shared = await get_redis()
            await r_shared.publish(
                f"agent:events:{session_id}",
                json.dumps({"type": "done", "session_id": session_id})
            )

        task = asyncio.create_task(run_orchestrator())

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            msg_data = json.loads(message["data"])
            await ws.send_json(msg_data)
            if msg_data.get("type") == "done":
                break

        await task

    except WebSocketDisconnect:
        print("[ws] client disconnected")
    except Exception as e:
        print(f"[ws] error: {e}")
        try:
            await ws.send_json({"type": "error", "payload": str(e)})
        except:
            pass
    finally:
        await pubsub.unsubscribe()
        await r_pubsub.aclose()


@app.websocket("/ws/events/{session_id}")
async def ws_events(ws: WebSocket, session_id: str):
    """
    Subscribe-only WebSocket.
    Frontend connects here to receive live agent events for a session.
    The orchestrator is triggered separately via POST /debug.
    """
    await ws.accept()
    print(f"[ws:events] client connected — session: {session_id}")

    r = aioredis.from_url(os.getenv("REDIS_URL"), decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"agent:events:{session_id}")
    await ws.send_json({"type": "ready", "agent_id": "system", "payload": "subscribed"})

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            data = json.loads(message["data"])
            await ws.send_json(data)
            if data.get("type") == "done":
                break

    except WebSocketDisconnect:
        print(f"[ws:events] client disconnected — session: {session_id}")
    except Exception as e:
        print(f"[ws:events] error: {e}")
    finally:
        await pubsub.unsubscribe(f"agent:events:{session_id}")
        await r.aclose()
        print(f"[ws:events] closed — session: {session_id}")