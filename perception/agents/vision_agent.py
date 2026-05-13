import sys
import asyncio
import json
import os
from pathlib import Path


sys.path.append(str(Path(__file__).resolve().parents[2]))

from shared.schema import DebugRequest, AgentMessage
from dotenv import load_dotenv
from anthropic import Anthropic, APIError, APITimeoutError
from redis import Redis
import redis.asyncio as aioredis

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

redis_client = Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    password=os.getenv("REDIS_PASSWORD", None),
    decode_responses=True,
    ssl=True
)

SYSTEM_PROMPT = """
You are a expert debugger agent. You will be given a screenshot of an error message. Analyze the image and provide insights on what the error is and how to fix it. Be concise and focus on the key information in the screenshot.
Always respond in the specified json format only.

json format:
{
 "error_summary": "A brief summary of the error",
 "error_type": "The type of error (e.g., SyntaxError, NullPointerException)",
 "error_linenumber": "The line number where the error occurs, this could be null if not available or number if available",
 "error_filename": "The name of the file where the error occurs, this could be null if not available or string if available",
 "stack_trace": ["filename:line:function"] or [] if not visible,
 "confidence": a float between 0.0 and 1.0 based on how clearly you can read the error
}

IMPORTANT: Return ONLY the JSON object. 
No explanation, no markdown, no backticks. 
Just the raw JSON.

If the image is blurry or no error is visible, 
still return the JSON with null values and 
confidence below 0.5. Never guess.
"""

def extract_from_image(image_base64: str) -> dict:
    # 1 — validate image is not empty
    if not image_base64 or len(image_base64) < 100:
        raise ValueError("Image base64 string is too short or empty")

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": image_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": "Analyse the screenshot and extract the error information."
                        }
                    ]
                }
            ]
        )
    except APITimeoutError:
        print("[vision_agent] ⚠️ Claude API timed out")
        raise
    except APIError as e:
        print(f"[vision_agent] ⚠️ Claude API error: {e.status_code} - {e.message}")
        raise

    # 2 — validate Claude returned something
    raw = response.content[0].text.strip()
    if not raw:
        raise ValueError("Claude returned empty response")

    # 3 — safe JSON parse
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[vision_agent] ⚠️ Claude returned invalid JSON: {raw}")
        raise ValueError(f"JSON parse failed: {e}")

    # 4 — validate confidence field exists
    if "confidence" not in result:
        result["confidence"] = 0.0

    return result


async def run_vision_agent(request: DebugRequest) -> dict:
    if not request.images:
        print("[vision_agent] ⚠️ No images in request")
        return None

    results = []
    failed = 0

    for i, image in enumerate(request.images):
        try:
            result = await asyncio.to_thread(extract_from_image, image)
            print(f"[vision_agent] ✅ Image {i+1} extracted: {result}")
            results.append(result)
        except ValueError as e:
            print(f"[vision_agent] ⚠️ Image {i+1} skipped — {e}")
            failed += 1
        except Exception as e:
            print(f"[vision_agent] ❌ Image {i+1} failed — {e}")
            failed += 1

    # 5 — if all images failed, return None
    if not results:
        print(f"[vision_agent] ❌ All {failed} images failed — nothing to publish")
        return None

    overall_confidence = sum(r["confidence"] for r in results) / len(results)

    msg = AgentMessage(
        session_id=request.session_id,
        type="error_extracted",
        agent_id="vision_agent",
        content={
            "images_analyzed": len(results),
            "images_failed": failed,
            "extractions": results
        },
        confidence=overall_confidence
    )

    try:
        r = aioredis.from_url(os.getenv("REDIS_URL"), decode_responses=True)
        await r.rpush(
    f"results:{request.session_id}:vision",
    json.dumps({
        "agent_id": "vision_agent",
        "extractions": results,
        "confidence": overall_confidence,
    })
)
        await r.expire(f"results:{request.session_id}:vision", 300)  # expire in 5 min
        await r.aclose()
    except Exception as e:
        print(f"[vision_agent] ❌ Redis publish failed: {e}")
        # don't raise — still return result even if redis fails

    return msg.model_dump()
