import json, time, os
import redis.asyncio as aioredis
from tools.redis_publisher import get_redis

# ── Redis keys ──────────────────────────────────────────
# user:{user_id}:sessions     → list of session_ids (newest first)
# session:{session_id}:result → full DebugResult JSON
# session:{session_id}:meta   → {user_id, timestamp, language, summary}

async def save_session(
    user_id:    str,
    session_id: str,
    result:     dict,
    request:    dict,
) -> None:
    """Save a completed debug session under the user's account."""
    r = await get_redis()

    meta = {
        "user_id":    user_id,
        "session_id": session_id,
        "timestamp":  time.time(),
        "language":   request.get("language", "python"),
        "summary":    result.get("root_cause", "")[:100],
        "confidence": result.get("confidence", 0.0),
    }

    # Store full result — 7 day TTL
    await r.setex(
        f"session:{session_id}:result",
        604800,
        json.dumps(result, default=str)
    )

    # Store metadata
    await r.setex(
        f"session:{session_id}:meta",
        604800,
        json.dumps(meta)
    )

    # Add to user's session list (keep last 50)
    await r.lpush(f"user:{user_id}:sessions", session_id)
    await r.ltrim(f"user:{user_id}:sessions", 0, 49)
    await r.expire(f"user:{user_id}:sessions", 604800)

    print(f"[memory] saved session {session_id} for user {user_id}")

async def get_user_sessions(user_id: str, limit: int = 10) -> list[dict]:
    """Get a user's recent debug sessions for the history sidebar."""
    r = await get_redis()

    session_ids = await r.lrange(f"user:{user_id}:sessions", 0, limit - 1)

    sessions = []
    for sid in session_ids:
        meta_raw = await r.get(f"session:{sid}:meta")
        if meta_raw:
            sessions.append(json.loads(meta_raw))

    return sessions

async def get_session_result(session_id: str) -> dict | None:
    """Load a full past session result."""
    r = await get_redis()
    raw = await r.get(f"session:{session_id}:result")
    return json.loads(raw) if raw else None

async def get_user_context(user_id: str) -> str:
    """
    Build a context string from user's last 3 sessions.
    Passed into analyse_node so Claude knows their history.
    """
    sessions = await get_user_sessions(user_id, limit=3)
    if not sessions:
        return ""

    lines = ["User's recent debug history:"]
    for s in sessions:
        lines.append(
            f"- [{s['language']}] {s['summary']} (confidence: {s['confidence']:.1f})"
        )
    return "\n".join(lines)