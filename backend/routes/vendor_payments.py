from fastapi import APIRouter, HTTPException, Header
from database import get_supabase_client, supabase
from models import VendorPaymentCreate
import calendar

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


@router.get("/vendor-payments")
async def list_vendor_payments(store_id: str, month: int, year: int, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    last_day = calendar.monthrange(year, month)[1]
    result = db.table("vendor_payments").select("*").eq("user_id", user_id).eq("store_id", store_id).gte("payment_date", f"{year}-{month:02d}-01").lte("payment_date", f"{year}-{month:02d}-{last_day}").order("payment_date").execute()
    return result.data


@router.post("/vendor-payments")
async def create_vendor_payment(payment: VendorPaymentCreate, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    data = payment.model_dump(mode="json")
    data["user_id"] = user_id
    result = db.table("vendor_payments").insert(data).execute()
    return result.data[0]


@router.delete("/vendor-payments/{payment_id}")
async def delete_vendor_payment(payment_id: str, authorization: str = Header(None)):
    user_id = get_user_id(authorization)
    db = get_supabase_client()
    result = db.table("vendor_payments").delete().eq("id", payment_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"message": "Deleted"}
