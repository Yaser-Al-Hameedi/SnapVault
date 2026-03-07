from fastapi import APIRouter, UploadFile, File, HTTPException, Header
from models import TaskResponse
import os
import uuid
import logging
from routes.tasks import process_document_task
from celery_app import celery_app
from database import supabase, get_supabase_client, upload_file_to_storage

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter() # This is for all upload-related enpoints

# Admin users (unlimited uploads) — comma-separated user IDs
ADMIN_USER_IDS = [uid.strip() for uid in os.getenv("ADMIN_USER_ID", "").split(",") if uid.strip()]
# Upload limit for regular users
USER_UPLOAD_LIMIT = 30


@router.post("/upload", response_model=TaskResponse)
async def upload_document(
    file: UploadFile = File(...),
    authorization: str = Header(None)
):
    # Verify user authentication
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")

    token = authorization.replace("Bearer ", "")

    # Verify token with Supabase and get user_id
    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    # Check upload limit for non-admin users (per-request check to prevent race conditions)
    if user_id not in ADMIN_USER_IDS:
        supabase_client = get_supabase_client()
        result = supabase_client.table("documents").select("id", count="exact").eq("user_id", user_id).execute()
        current_count = result.count or 0

        # Check if this single upload would exceed the limit
        if current_count >= USER_UPLOAD_LIMIT:
            raise HTTPException(
                status_code=403,
                detail=f"Upload limit reached. You have {current_count}/{USER_UPLOAD_LIMIT} documents."
            )

    # Read file bytes and upload to "pending" folder in storage
    try:
        file_bytes = await file.read()
        pending_path = f"pending/{uuid.uuid4()}_{file.filename}"
        upload_file_to_storage(pending_path, file_bytes, file.content_type)
        logger.info(f"[DEBUG] Uploaded to pending storage: {pending_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

    # Pass only the storage path to Celery (not the file data)
    logger.info(f"[DEBUG] Sending task with storage path: {pending_path}")

    try:
        result = process_document_task.delay(pending_path, file.filename, file.content_type, user_id)
        logger.info(f"[DEBUG] Task sent successfully! Task ID: {result.id}")
    except Exception as e:
        logger.error(f"[DEBUG] Failed to send task: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to queue task: {str(e)}")

    return {
        "task_id": result.id,
        "status": "processing",
        "message": "File queued for processing"
    }
    


