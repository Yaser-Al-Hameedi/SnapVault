from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import upload, search, update, status, delete, bookkeeping

app = FastAPI(title="SnapX API", version="1.0.0")

# CORS - allows frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://snap-x-yaser-al-hameedis-projects.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(update.router, prefix="/api", tags=["update"])
app.include_router(status.router, prefix="/api", tags=["status"])
app.include_router(delete.router, prefix="/api", tags=["delete"])
app.include_router(bookkeeping.router, prefix="/api", tags=["bookkeeping"])

@app.get("/test-supabase")
def test_supabase():
    from database import get_supabase_client
    try:
        supabase = get_supabase_client()
        # Try to query the documents table
        result = supabase.table("documents").select("*").limit(1).execute()
        return {"status": "success", "message": "Supabase connected!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
def read_root():
    return {"message": "Backend is running"}