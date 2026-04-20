from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import json, os

load_dotenv()
from shared.schema import DebugRequest, DebugResult
from agents.orchestrator import orchestrator

app = FastAPI(title="Debug Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/debug", response_model=DebugResult)
async def debug(req: DebugRequest):
    result = await orchestrator.ainvoke({
        # ── original fields ──
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
        # ── new week 3 fields ──
        "patch_diff":        None,
        "patch_explanation": None,
        "test_code":         None,
        "tests_passed":      None,
        "test_output":       None,
    })

    return DebugResult(
        session_id=  req.session_id or "default-session",
        root_cause=  result["root_cause"],
        # ── updated: now returns real patch diff instead of empty string ──
        patch=       result.get("patch_diff") or "",
        # ── updated: now returns patch explanation instead of root_cause ──
        explanation= result.get("patch_explanation") or "",
        # ── new: returns generated test code ──
        tests=       [result["test_code"]] if result.get("test_code") else [],
        # ── new: 0.9 if tests passed, 0.6 if they failed or didn't run ──
        confidence=  0.9 if result.get("tests_passed") else 0.6,
    )

@app.websocket("/ws/debug")
async def ws_debug(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            req = DebugRequest(**json.loads(data))
            await ws.send_json({
                "agent_id": "orchestrator",
                "type":     "thinking",
                "payload":  f"Received request: {req.user_message}",
            })
    except WebSocketDisconnect:
        print("Client disconnected")