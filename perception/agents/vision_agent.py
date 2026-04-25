import sys
import asyncio
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[2]))
from shared.schema import DebugRequest, AgentMessage
from dotenv import load_dotenv   
from anthropic import Anthropic
from redis import Redis
import os
import json

load_dotenv() 
print(os.getenv("ANTHROPIC_API_KEY")    )
client=Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

redis_client = Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    password=os.getenv("REDIS_PASSWORD", None),
    decode_responses=True
)

SYSTEM_PROMPT = """
 You are a expert debugger agent. You will be given a screenshot of an error message. Analyze the image and provide insights on what the error is and how to fix it. Be concise and focus on the key information in the screenshot.
Always respond in the specified json format only.

json format:
{
 "error_summary": "A brief summary of the error",
 "error_type": "The type of error (e.g., SyntaxError, NullPointerException)",
 "error_linenumber": "The line number where the error occurs, this could be null if not available or number if available",
 "error_filename": "The name of the file where the error occurs ,this could be null if not available or string if available",
 "stack_trace":  "["filename:line:function"] or [] if not visible",
 "confidence": a float between 0.0 and 1.0 based on how clearly you can read the error
}

IMPORTANT: Return ONLY the JSON object. 
No explanation, no markdown, no backticks. 
Just the raw JSON.

If the image is blurry or no error is visible, 
still return the JSON with null values and 
confidence below 0.5. Never guess.

"""

async def extract_from_image(image_base64: str) -> dict :
    response=client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image",
                     "source":{
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_base64
                        }},

                    {"type":"text",
                     "text": "Analyse the screenshot and extract the error information."
                    }
                ]
            }
        ]

    )
    
    return json.loads(response.content[0].text)

async def run_vision_agent(request: DebugRequest) -> dict:
    if not request.images:
        return None    

    results = []
    for image in request.images:
        result = await asyncio.to_thread(extract_from_image, image)
        print(f"[vision_agent] extracted from image: {result}")
        results.append(result)

    overall_confidence = sum(r["confidence"] for r in results) / len(results)

    msg=AgentMessage(
        session_id=request.session_id,
        type="error_extracted",
        agent_id="vision_agent",
        content={"images_analyzed": len(results), "extractions": results},
        confidence=overall_confidence
    )
    
    redis_client.publish("agent_messages", msg.json())
    return msg.dict()