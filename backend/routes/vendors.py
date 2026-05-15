from fastapi import APIRouter, HTTPException, Header
from database import get_supabase_client, supabase
from models import VendorCreate

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


@router.get("/vendors")
async def list_vendors(authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("vendors").select("*").eq("user_id", user_id).order("name").execute()
    return result.data


@router.post("/vendors")
async def create_vendor(vendor: VendorCreate, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("vendors").insert({"user_id": user_id, "name": vendor.name}).execute()
    return result.data[0]


@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("vendors").delete().eq("id", vendor_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return {"message": "Deleted"}
