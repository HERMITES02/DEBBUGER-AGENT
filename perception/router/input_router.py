import asyncio, base64, re, sys
from pathlib import Path

from fastapi import FastAPI
sys.path.append(str(Path(__file__).resolve().parents[2]))
from shared.schema import DebugRequest, AgentMessage

def classify(request: DebugRequest) -> list[dict]:
    modalities = []
    modalities.append({"type": "code", "language": request.language})
    if request.images:
        modalities.append({"type": "images", "count":len(request.images)})
    if request.logs:
        modalities.append({"type": "logs"})
    if request.description:
        modalities.append({"type": "description"})
    return modalities

def encode_image(image_data)-> str:
    if isinstance(image_data, str):
        return image_data
    return base64.b64encode(image_data).decode("utf-8")

def preprocess_images(images: list) -> list[str]:
    return [encode_image(image) for image in images]

def strip_ansi(text:str)->str:
    ansi_escape = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
    return ansi_escape.sub('', text).strip()

async def dispatch(request: DebugRequest) -> list:
    tasks = []
    #tasks.append(run_code_analysis_agent(request))
    #if request.images:
            #tasks.append(run_vision_agent(request))
    #if request.logs or request.description:
            #tasks.append(run_context_builder_agent(request))

    if not tasks:
        print(f"[router] no agents dispatched yet — build agents next")
        return []

    
    results = await asyncio.gather(*tasks)
    return results

async def route_final(request: DebugRequest)-> dict:

    print(f"[router] Received request — session: {request.session_id}")

    modalities = classify(request)
    print(f"[router] detected modalities: {[m['type'] for m in modalities]}")

    if request.images:
        request.images = preprocess_images(request.images)

    if request.logs:
        request.logs = strip_ansi(request.logs)

    results= await dispatch(request)

    return {
        "session_id": request.session_id,
        "modalities_detected": modalities,
        "agents_fired": len(results)
    }

app = FastAPI()

@app.post("/route")
async def route_endpoint(request: DebugRequest):
    return await route_final(request)
    
@app.get("/health")
async def health():
    return {"status": "ok", "service": "input_router"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("input_router:app", host="0.0.0.0", port=8001, reload=True)