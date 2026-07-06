from fastapi import APIRouter, HTTPException, Header
from database import get_supabase_client, supabase
from models import LotteryEntryCreate, LotteryEntryUpdate
import calendar
import os

router = APIRouter()

ADMIN_USER_IDS = set(os.environ.get("ADMIN_USER_ID", "").split(","))


def get_user_id(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")
    token = authorization.replace("Bearer ", "")
    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


@router.get("/lottery-entries")
async def list_lottery_entries(store_id: str, month: int, year: int, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    last_day = calendar.monthrange(year, month)[1]
    month_start = f"{year}-{month:02d}-01"
    month_end = f"{year}-{month:02d}-{last_day}"
    query = db.table("lottery_entries").select("*").eq("store_id", store_id)
    if user_id not in ADMIN_USER_IDS:
        query = query.eq("user_id", user_id)
    result = query.lte("week_start", month_end).gte("week_end", month_start).order("week_start").execute()
    return result.data


@router.post("/lottery-entries")
async def create_lottery_entry(entry: LotteryEntryCreate, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    data = entry.model_dump(mode="json")
    data["user_id"] = user_id
    result = db.table("lottery_entries").insert(data).execute()
    return result.data[0]


@router.delete("/lottery-entries/{entry_id}")
async def delete_lottery_entry(entry_id: str, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("lottery_entries").delete().eq("id", entry_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Deleted"}


@router.patch("/lottery-entries/{entry_id}")
async def update_lottery_entry(entry: LotteryEntryUpdate, entry_id: str, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    update_fields = entry.model_dump(mode='json', exclude_none=True)
    db = get_supabase_client()
    result = db.table("lottery_entries").update(update_fields).eq("id", entry_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Updated"}

