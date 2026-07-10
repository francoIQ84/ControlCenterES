import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from src import database, scheduler
from src.api import api_router
from src.utils.ssl_gen import ensure_ssl_certs

# Initialize database
database.init_db()

# Start background scheduler
scheduler.start_scheduler()

# Create invoices and uploads directory
os.makedirs('invoices', exist_ok=True)
os.makedirs('uploads', exist_ok=True)

# Create FastAPI app
app = FastAPI(title="ControlCenterES - API")

from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = traceback.format_exc()
    print("GLOBAL ERROR:", error_msg)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "traceback": error_msg}
    )


# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for invoices and uploads
app.mount("/invoices", StaticFiles(directory="invoices"), name="invoices")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include API routes
app.include_router(api_router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8090,
        reload=True
    )
