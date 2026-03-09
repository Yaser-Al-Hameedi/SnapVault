from fastapi import APIRouter, HTTPException, Header
from database import get_supabase_client, supabase
from models import StoreCreate

router = APIRouter()


def get_user_id(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")
    token = authorization.replace("Bearer ", "")
    try:
        user_response = supabase.auth.get_user(token)
        return user_response.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


@router.get("/stores")
async def list_stores(authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("stores").select("*").eq("user_id", user_id).order("created_at").execute()
    return result.data


@router.post("/stores")
async def create_store(store: StoreCreate, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("stores").insert({"user_id": user_id, "name": store.name}).execute()
    return result.data[0]


@router.delete("/stores/{store_id}")
async def delete_store(store_id: str, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("stores").delete().eq("id", store_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"message": "Deleted"}
