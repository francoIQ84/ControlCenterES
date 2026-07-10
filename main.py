import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from src import database
from src.api import api_router
from src.utils.ssl_gen import ensure_ssl_certs

# Initialize database
database.init_db()

# Create invoices directory
os.makedirs('invoices', exist_ok=True)

# Create FastAPI app
app = FastAPI(title="ControlCenterES - API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for invoices
app.mount("/invoices", StaticFiles(directory="invoices"), name="invoices")

# Include API routes
app.include_router(api_router, prefix="/api")

if __name__ == "__main__":
    cert_path, key_path = ensure_ssl_certs()
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8088,
        ssl_keyfile=key_path,
        ssl_certfile=cert_path,
        reload=True
    )
