import time, json
from sqlalchemy import select
from app.auth.models import get_db, SessionRecord

async def save_session(user_id: str, session_id: str, result: dict, request: dict):
    """
    Save a completed debug session to SQLite.
    result = orchestrator state dict (has patch_diff, patch_explanation etc.)
    request = req.model_dump() (has user_message, code, language etc.)
    """
    try:
        async with get_db() as db:
            # Skip if already saved
            existing = await db.get(SessionRecord, session_id)
            if existing:
                print(f"[memory] session {session_id} already exists — skipping")
                return

            # Build summary from root_cause — strip the ROOT_CAUSE: prefix
            root_cause = result.get("root_cause", "") or ""
            summary = root_cause
            if "ROOT_CAUSE:" in root_cause:
                summary = root_cause.split("ROOT_CAUSE:")[-1].strip().split("\n")[0]
            summary = summary[:120]

            s = SessionRecord(
                session_id=   session_id,
                user_id=      user_id,
                timestamp=    time.time(),
                language=     request.get("language", "python"),
                summary=      summary,
                confidence=   result.get("confidence") or 0.0,
                root_cause=   root_cause,
                patch=        result.get("patch_diff") or result.get("patch") or "",
                explanation=  result.get("patch_explanation") or result.get("explanation") or "",
                tests=        json.dumps(
                                  [result["test_code"]] if result.get("test_code")
                                  else result.get("tests", [])
                              ),
                code=         request.get("code"),
                user_message= request.get("user_message"),
                images=       json.dumps(request.get("images", [])),
            )
            db.add(s)
            await db.commit()
            print(f"[memory] ✅ saved session {session_id} for user {user_id} — summary: {summary[:50]}")

    except Exception as e:
        print(f"[memory] ❌ ERROR saving session: {e}")
        import traceback
        traceback.print_exc()

async def get_user_sessions(user_id: str, limit: int = 50) -> list[dict]:
    async with get_db() as db:
        result = await db.execute(
            select(SessionRecord)
            .where(SessionRecord.user_id == user_id)
            .order_by(SessionRecord.timestamp.desc())
            .limit(limit)
        )
        sessions = result.scalars().all()
        return [
            {
                "session_id": s.session_id,
                "summary":    s.summary or "Debug session",
                "timestamp":  s.timestamp,
                "confidence": s.confidence,
                "language":   s.language,
                "images":     json.loads(s.images or "[]"),
            }
            for s in sessions
        ]

async def get_session_result(session_id: str) -> dict | None:
    async with get_db() as db:
        s = await db.get(SessionRecord, session_id)
        if not s:
            return None
        return {
            "session_id":  s.session_id,
            "root_cause":  s.root_cause,
            "patch":       s.patch,
            "explanation": s.explanation,
            "tests":       json.loads(s.tests or "[]"),
            "confidence":  s.confidence,
            "language":    s.language,
            "timestamp":   s.timestamp,
            "images":      json.loads(s.images or "[]"),
            "request": {
                "code":         s.code,
                "user_message": s.user_message,
            }
        }

async def get_user_context(user_id: str) -> str:
    """Build context string from last 3 sessions for analyse_node prompt."""
    sessions = await get_user_sessions(user_id, limit=3)
    if not sessions:
        return ""
    lines = ["User's recent debug history:"]
    for s in sessions:
        conf = s.get("confidence", 0.0)
        lines.append(
            f"- [{s['language']}] {s['summary']} (confidence: {conf:.1f})"
        )
    return "\n".join(lines)