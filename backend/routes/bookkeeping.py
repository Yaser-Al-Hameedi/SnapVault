from fastapi import APIRouter, UploadFile, File, HTTPException, Header
from database import get_supabase_client, supabase
from services import ocr_service
from services import ai_service
from models import BookeepingEntry, BookeepingUpdate
import os
import uuid
import calendar
from datetime import date

router = APIRouter()

TEMP_FOLDER = "temp_uploads"
os.makedirs(TEMP_FOLDER, exist_ok=True)


@router.post("/bookkeeping/extract")
async def extract_report(file: UploadFile = File(...), authorization: str = Header(None)):

    # 1. Verify auth token (same pattern as upload.py)
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail= "Missing or invalid authorization token")
    
    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    # 2. Read file bytes and save to temp folder
    file_bytes = await file.read()
    unique_id = str(uuid.uuid4())
    temp_file_path = os.path.join(TEMP_FOLDER, f"{unique_id}_{file.filename}")

    with open(temp_file_path, "wb") as f:
        f.write(file_bytes)

    # 3. Run OCR on the temp file

    extracted_text = ocr_service.extract_text(temp_file_path)
    
    # 4. Call ai_service.extract_report_fields() with the OCR text

    ai_data = ai_service.extract_report_fields(extracted_text)
    
    # 5. Clean up temp file

    try:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
    except Exception:
        pass
    

    return ai_data


@router.post("/bookkeeping/save")
async def save_entry(entry: BookeepingEntry, authorization: str = Header(None)):

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail= "Missing or invalid authorization token")
    
    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    db = get_supabase_client()

    # Check for duplicate date
    existing = db.table("bookkeeping_entries").select("id").eq("user_id", user_id).eq("entry_date", str(entry.entry_date)).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"An entry for {entry.entry_date} already exists.")

    data = entry.model_dump(mode= 'json')

    data["user_id"] = user_id

    result = db.table("bookkeeping_entries").insert(data).execute()

    return result.data[0]


@router.get("/bookkeeping/retrieve")
async def get_entries(month: int, year: int, authorization: str = Header(None)):

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail= "Missing or invalid authorization token")
    
    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    db = get_supabase_client()

    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])

    query = db.table("bookkeeping_entries").select("*").eq("user_id", user_id).gte("entry_date", str(first_day)).lte("entry_date", str(last_day)).execute()

    result = query.data

    return result


@router.patch("/bookkeeping/update/{entry_id}")
async def update_entry(entry_id: str, update_data: BookeepingUpdate, authorization: str = Header(None)):

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail= "Missing or invalid authorization token")
    
    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    
    db = get_supabase_client()

    update_fields = update_data.model_dump(mode = 'json', exclude_none=True)

    query = db.table("bookkeeping_entries").update(update_fields).eq("id", entry_id).eq("user_id", user_id)

    result = query.execute()

    if not result.data:
        raise HTTPException(status_code=404, detail= f"resourse not found")
    
    return result.data[0]


@router.delete("/bookkeeping/delete/{entry_id}")
async def delete_entry(entry_id: str, authorization: str = Header(None)):

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail= "Missing or invalid authorization token")
    
    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    
    db = get_supabase_client()

    query = db.table("bookkeeping_entries").delete().eq("id", entry_id).eq("user_id", user_id).execute()

    result = query.data

    if not result:
        raise HTTPException(status_code=404, detail= f"resourse not found")
    
    return {"message": "Deleted"}