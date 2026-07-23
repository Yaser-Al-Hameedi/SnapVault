from fastapi import APIRouter, UploadFile, File, HTTPException, Header
from database import get_supabase_client, supabase
from services import ai_service
from models import BookeepingEntry, BookeepingUpdate
import os
import uuid
import calendar
from datetime import date

ADMIN_USER_IDS = set(os.environ.get("ADMIN_USER_ID", "").split(","))

router = APIRouter()

TEMP_FOLDER = "temp_uploads"
os.makedirs(TEMP_FOLDER, exist_ok=True)


def get_user_id(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")
    token = authorization.replace("Bearer ", "")
    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


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

    # 3. Extract fields directly from image using Claude vision
    ai_data = ai_service.extract_report_fields_from_image(temp_file_path)
    
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

    # Check for duplicate date within same store
    existing = db.table("bookkeeping_entries").select("id").eq("user_id", user_id).eq("store_id", entry.store_id).eq("entry_date", str(entry.entry_date)).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"An entry for {entry.entry_date} already exists.")

    data = entry.model_dump(mode= 'json')

    data["user_id"] = user_id

    result = db.table("bookkeeping_entries").insert(data).execute()

    return result.data[0]


@router.get("/bookkeeping/retrieve")
async def get_entries(month: int, year: int, store_id: str, authorization: str = Header(None)):

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

    if user_id in ADMIN_USER_IDS:
        query = db.table("bookkeeping_entries").select("*").eq("store_id", store_id).gte("entry_date", str(first_day)).lte("entry_date", str(last_day)).execute()
    else:
        query = db.table("bookkeeping_entries").select("*").eq("user_id", user_id).eq("store_id", store_id).gte("entry_date", str(first_day)).lte("entry_date", str(last_day)).execute()

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

@router.get("/bookkeeping/summary")
async def store_summaries(month: int, year: int, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    store_summaries = []

    if user_id in ADMIN_USER_IDS:
        response = get_supabase_client().table("stores").select("id, name").order("created_at").execute()
    else:
        response = get_supabase_client().table("stores").select("id, name").eq("user_id", user_id).order("created_at").execute()

    stores = [{"id": s["id"], "name": s["name"]} for s in response.data]

    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])
    
    for store in stores:
        db = get_supabase_client()

        bookkeeping_entries = db.table("bookkeeping_entries").select("income, tax, payouts").eq("store_id", store["id"]).gte("entry_date", first_day).lte("entry_date", last_day).execute()

        vendor_payments = db.table("vendor_payments").select("amount").eq("store_id", store["id"]).gte("payment_date", first_day).lte("payment_date", last_day).execute()

        lottery = db.table("lottery_entries").select("amount").eq("store_id", store["id"]).lte("week_start", last_day).gte("week_end", first_day).execute()

        income = sum(e["income"] for e in bookkeeping_entries.data)
        payouts = sum(e["payouts"] for e in bookkeeping_entries.data)
        tax = sum(e["tax"] for e in bookkeeping_entries.data)
        vendor_total = sum(p["amount"] for p in vendor_payments.data)
        lottery_total = sum(l["amount"] for l in lottery.data)
        profit = income + lottery_total - payouts - vendor_total

        store_summaries.append({
            "store_id": store["id"],
            "store_name": store["name"],
            "income": income,
            "payouts": payouts,
            "tax": tax,
            "vendor_total": vendor_total,
            "lottery_total": lottery_total,
            "profit": profit,
        })

    return store_summaries

