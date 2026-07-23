from celery_app import celery_app
from database import get_supabase_client, upload_file_to_storage, download_file_from_storage, delete_file_from_storage
from models import DocumentResponse
import os
import re
from datetime import datetime
from services import ocr_service
from services import ai_service
from services import clean_image_service
from mimetypes import guess_type
import uuid
import time

TEMP_FOLDER = "temp_uploads"
os.makedirs(TEMP_FOLDER, exist_ok=True)

@celery_app.task(name='process_document_task')
def process_document_task(pending_storage_path: str, original_filename: str, content_type: str, user_id: str):
    temp_file_path = None
    try:
        start_time = time.time()

        # Download file from pending storage
        print(f"[{original_filename}] Downloading from storage...")
        file_bytes = download_file_from_storage(pending_storage_path)

        # Save to temp file for OCR processing
        unique_id = str(uuid.uuid4())
        temp_file_path = os.path.join(TEMP_FOLDER, f"{unique_id}_{original_filename}")

        with open(temp_file_path, "wb") as f:
            f.write(file_bytes)

        # OCR extraction (kept for extracted_text search field)
        ocr_start = time.time()
        extracted_text = ocr_service.extract_text(temp_file_path)
        print(f"[{original_filename}] OCR: {time.time() - ocr_start:.2f}s")

        # AI field extraction via Claude vision (more accurate than OCR text)
        ai_start = time.time()
        ai_data = ai_service.extract_fields_from_image(temp_file_path)
        print(f"[{original_filename}] AI vision extraction: {time.time() - ai_start:.2f}s")

        # Preparing final storage path
        unique_filename = f"{uuid.uuid4()}_{original_filename}"
        unique_filename = re.sub(r'[^\w\-.]', '_', unique_filename)
        storage_path = f"{ai_data['document_type']}/{datetime.now().year}/{datetime.now().month}/{unique_filename}"

        # Upload to storage (use the original file bytes)
        public_url = upload_file_to_storage(
            file_path=storage_path,
            file_data=file_bytes,
            content_type=content_type
        )

        # Save to database
        supabase = get_supabase_client()

        document_data = {
            "filename": original_filename,
            "file_path": public_url,
            "vendor_name": ai_data.get("vendor_name"),
            "document_date": ai_data.get("document_date"),
            "total_amount": ai_data.get("total_amount"),
            "document_type": ai_data.get("document_type"),
            "extracted_text": extracted_text,
            "user_id": user_id
        }

        result = supabase.table("documents").insert(document_data).execute()

        if not result.data:
            raise Exception("Failed to insert into database")

        saved_document = result.data[0]

        # Cleanup: delete temp file and pending storage file
        try:
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except Exception:
            pass

        try:
            delete_file_from_storage(pending_storage_path)
            print(f"[{original_filename}] Deleted pending file from storage")
        except Exception:
            pass

        print(f"[{original_filename}] TOTAL TIME: {time.time() - start_time:.2f}s")
        return saved_document

    except Exception as e:
        # Cleanup temp file on failure (keep pending file for debugging)
        try:
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except Exception:
            pass
        raise Exception(f"Failed to process {original_filename}: {str(e)}")
