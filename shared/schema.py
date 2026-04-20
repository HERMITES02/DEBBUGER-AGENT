from pydantic import BaseModel
from typing import Optional
import uuid

#user request format to the agent
class DebugRequest(BaseModel):
    user_message: str
    language: str = "python"
    code: str | None = None        # ← was: code: str
    logs: str | None = None
    images: list[str] = []
    description: str | None = None
    session_id: str | None = None

#dev1 agent message format for dev 2 orchestrator
class AgentMessage(BaseModel):
    agent_id:   str
    type:       str
    content:    dict
    session_id: str
    confidence: float = 1.0

#dev2 orchestrator gives format to dev1 to show on frontend
class DebugResult(BaseModel):
    session_id:  str
    root_cause:  str
    patch:       str
    explanation: str
    tests:       list[str] = []
    confidence:  float     = 1.0