import redis.asyncio as aioredis
import json
import os
import time
from dotenv import load_dotenv

load_dotenv()

# Single shared async Redis client — created once, reused for all calls
_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """
    Returns a shared async Redis client.
    Creates it on first call using REDIS_URL from .env
    """
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True
        )
    return _redis


async def publish_agent_event(
    session_id: str,
    agent_id:   str,
    event_type: str,
    payload:    str,
    confidence: float = 1.0,
) -> None:
    """
    Publish one agent event to Redis pub/sub.

    Channel: agent:events:{session_id}
    Each debug session gets its own channel so multiple
    concurrent sessions don't interfere with each other.

    event_type options:
        "thinking"  — agent has started working
        "tool_call" — agent is calling an external tool
        "result"    — agent finished, here's the output
        "error"     — agent failed with an error
    """
    try:
        r = await get_redis()

        message = json.dumps({
            "agent_id":  agent_id,
            "type":      event_type,
            "payload":   payload,
            "confidence": confidence,
            "timestamp": time.time(),
            "session_id": session_id,
        })

        channel = f"agent:events:{session_id}"
        await r.publish(channel, message)
        print(f"[redis] {agent_id} → {event_type} → {channel}")

    except Exception as e:
        # Never crash the agent pipeline because of a Redis publish failure
        print(f"[redis] publish failed — {agent_id}: {e}")


async def store_session_result(session_id: str, result: dict) -> None:
    """
    Store the final DebugResult in Redis for 1 hour.
    Useful for the frontend to fetch the result after WebSocket closes.

    Key: session:result:{session_id}
    TTL: 3600 seconds (1 hour)
    """
    try:
        r = await get_redis()
        await r.setex(
            f"session:result:{session_id}",
            3600,
            json.dumps(result, default=str)  # default=str handles non-serializable types
        )
        print(f"[redis] stored result for session {session_id}")

    except Exception as e:
        print(f"[redis] store_session_result failed: {e}")


async def get_session_result(session_id: str) -> dict | None:
    """
    Retrieve a previously stored session result.
    Returns None if session not found or expired.
    """
    try:
        r = await get_redis()
        data = await r.get(f"session:result:{session_id}")
        if data:
            return json.loads(data)
        return None

    except Exception as e:
        print(f"[redis] get_session_result failed: {e}")
        return None


async def store_session_state(session_id: str, state: dict) -> None:
    """
    Store intermediate agent state during a long-running session.
    Allows resuming if the server restarts mid-session.

    TTL: 30 minutes
    """
    try:
        r = await get_redis()
        await r.setex(
            f"session:state:{session_id}",
            1800,
            json.dumps(state, default=str)
        )

    except Exception as e:
        print(f"[redis] store_session_state failed: {e}")


async def close_redis() -> None:
    """
    Cleanly close the Redis connection.
    Call this when the FastAPI app shuts down.
    """
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        print("[redis] connection closed")