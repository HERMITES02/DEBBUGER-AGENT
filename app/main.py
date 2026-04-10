from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import json, os

load_dotenv()
from app.schemas import DebugRequest, DebugResult
from agents.orchestrator import orchestrator

app = FastAPI(title="Debug Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health():
    return {"status": "ok"}

# Main debug endpoint (REST)

@app.post("/debug", response_model=DebugResult)
async def debug(req: DebugRequest):
    result = await orchestrator.ainvoke({
        "messages": [],
        "user_request": req.user_message,
        "root_cause": "",
        "patch": "",
        "done": False,
    })
    return DebugResult(
        root_cause=result["root_cause"],
        confidence=0.8,
    )
# WebSocket for live agent streaming
@app.websocket("/ws/debug")
async def ws_debug(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            req = DebugRequest(**json.loads(data))
            # Stream placeholder messages
            await ws.send_json({
                "agent_id": "orchestrator",
                "type": "thinking",
                "payload": f"Received request: {req.user_message}",
            })
    except WebSocketDisconnect:
        print("Client disconnected")

