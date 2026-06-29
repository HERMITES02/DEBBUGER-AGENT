import time, json
from sqlalchemy import select, Column, String, Float, Text
from app.auth.models import Base, get_db, SessionRecord

async def save_session(user_id, session_id, result, request):
    try:
        async with get_db() as db:
            existing = await db.get(SessionRecord, session_id)
            if existing:
                return
            s = SessionRecord(
                session_id=  session_id,
                user_id=     user_id,
                timestamp=   time.time(),
                language=    request.get("language", "python"),
                summary=     (result.get("root_cause") or "")[:100],
                confidence=  result.get("confidence", 0.0),
                root_cause=  result.get("root_cause"),
                patch=       result.get("patch_diff"),
                explanation= result.get("patch_explanation"),
                tests=       json.dumps([result["test_code"]] if result.get("test_code") else []),
                code=        request.get("code"),
                user_message=request.get("user_message"),
            )
            db.add(s)
            await db.commit()
        print(f"[memory] saved session {session_id} for user {user_id}")
    except Exception as e:
        print(f"[memory] ERROR saving session: {e}")
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
                "summary":    s.summary,
                "timestamp":  s.timestamp,
                "confidence": s.confidence,
                "language":   s.language,
            }
            for s in sessions
        ]

async def get_session_result(session_id: str) -> dict | None:
    async with get_db() as db:
        s = await db.get(SessionRecord, session_id)
        if not s:
            return None
        return {
            "root_cause":  s.root_cause,
            "patch":       s.patch,
            "explanation": s.explanation,
            "tests":       json.loads(s.tests or "[]"),
            "confidence":  s.confidence,
            "request": {
                "code":         s.code,
                "user_message": s.user_message,
            }
        }

async def get_user_context(user_id: str) -> str:
    sessions = await get_user_sessions(user_id, limit=3)
    if not sessions:
        return ""
    lines = ["User's recent debug history:"]
    for s in sessions:
        lines.append(
            f"- [{s['language']}] {s['summary']} (confidence: {s['confidence']:.1f})"
        )
    return "\n".join(lines)