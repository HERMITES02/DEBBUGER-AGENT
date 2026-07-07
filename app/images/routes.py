import os
import uuid
import base64
from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

images_router = APIRouter(prefix="/api/images", tags=["images"])

# Initialize Cloudinary if credentials are set
try:
    import cloudinary
    import cloudinary.uploader
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME") or os.getenv("CLOUDNARY_CLOUD_NAME")
    api_key = os.getenv("CLOUDINARY_API_KEY")
    api_secret = os.getenv("CLOUDINARY_API_SECRET")
    if cloud_name and api_key and api_secret:
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True
        )
        CLOUDINARY_ENABLED = True
        print("[cloudinary] Configured successfully for image storage")
    else:
        CLOUDINARY_ENABLED = False
        print("[cloudinary] Env vars not set — falling back to base64 local storage")
except ImportError:
    CLOUDINARY_ENABLED = False
    print("[cloudinary] Library not installed — falling back to base64 local storage")

class Base64UploadRequest(BaseModel):
    image_data: str  # data:image/png;base64,... or raw base64

@images_router.post("/upload")
async def upload_image_file(file: UploadFile = File(...)):
    """
    Upload an image file to Cloudinary (if configured) or fallback to base64 Data URL.
    """
    try:
        contents = await file.read()
        if CLOUDINARY_ENABLED:
            res = cloudinary.uploader.upload(contents, folder="debugger_agent")
            return {
                "url": res["secure_url"],
                "public_id": res["public_id"],
                "storage": "cloudinary"
            }
        else:
            b64_str = base64.b64encode(contents).decode("utf-8")
            mime = file.content_type or "image/png"
            if not mime.startswith("image/"):
                mime = "image/png"
            data_url = f"data:{mime};base64,{b64_str}"
            return {
                "url": data_url,
                "public_id": f"local_{uuid.uuid4()}",
                "storage": "local"
            }
    except Exception as e:
        print(f"[images] Upload file error: {e}")
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")

@images_router.post("/upload-base64")
async def upload_image_base64(payload: Base64UploadRequest):
    """
    Upload a base64 string to Cloudinary (if configured) or return as-is.
    """
    try:
        if not payload or not payload.image_data:
            raise HTTPException(status_code=400, detail="No image_data provided")
        img_data = payload.image_data
        if CLOUDINARY_ENABLED:
            res = cloudinary.uploader.upload(img_data, folder="debugger_agent")
            return {
                "url": res["secure_url"],
                "public_id": res["public_id"],
                "storage": "cloudinary"
            }
        else:
            return {
                "url": img_data,
                "public_id": f"local_{uuid.uuid4()}",
                "storage": "local"
            }
    except Exception as e:
        print(f"[images] Upload base64 error: {e}")
        raise HTTPException(status_code=500, detail=f"Image base64 upload failed: {str(e)}")
