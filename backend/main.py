import os
import time

# Force process timezone to Argentina (Buenos Aires)
os.environ['TZ'] = 'America/Argentina/Buenos_Aires'
try:
    time.tzset()
except AttributeError:
    pass

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import uvicorn

from src import database, scheduler
from src.api import api_router
from src.middleware import TenantResolverMiddleware
from src.utils.ssl_gen import ensure_ssl_certs

# Initialize database
database.init_db()

# En producción el scheduler corre como servicio independiente (controlcenter-scheduler.service).
# Para desarrollo local opcional sin servicio separado, se puede activar con RUN_SCHEDULER=1.
if os.environ.get("RUN_SCHEDULER", "0") == "1":
    scheduler.start_scheduler()

# Create invoices and uploads directory
os.makedirs('invoices', exist_ok=True)
os.makedirs('uploads', exist_ok=True)
os.makedirs('backups', exist_ok=True)
os.makedirs('quotes', exist_ok=True)

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


# Resolve the tenant for every request before anything touches the database.
# Added before CORS on purpose: add_middleware() puts the last one added on the
# outside, so CORS stays outermost and still answers preflight requests (and
# decorates the tenant middleware's own 403/404 responses).
#
# TENANT_TRUST_HEADER lets a plain X-Tenant-Slug header select the tenant. It is
# for local development only, where there is no subdomain DNS. Never enable it
# on an internet-facing deployment.
app.add_middleware(
    TenantResolverMiddleware,
    trust_header=os.environ.get("TENANT_TRUST_HEADER", "0") == "1",
)

# Gzip compression for all JSON / API payloads >= 1KB
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Setup CORS
#
# El regex se arma desde TENANT_BASE_DOMAINS en lugar de hardcodear
# controlcenter.app: si alguien cambia el dominio de la plataforma por
# variable de entorno, el resolver lo toma pero CORS seguía rechazando todos
# los subdominios nuevos, con el panel en blanco y ningún error en el backend.
import re as _re

_base_domains = [d.strip() for d in
                 os.environ.get("TENANT_BASE_DOMAINS", "controlcenter.app").split(",")
                 if d.strip()]
_subdomain_pattern = "|".join(_re.escape(d) for d in _base_domains)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_origin_regex=rf"https://[a-z0-9][a-z0-9-]*\.({_subdomain_pattern})",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# `uploads` se sirve público a propósito: las imágenes del catálogo, el logo y
# las fotos de los artículos del blog se referencian por URL desde la tienda
# web y desde Meta, que tiene que poder descargarlas para publicar.
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# `invoices` y `quotes` NO se montan. Contienen facturas y presupuestos con
# datos fiscales y de clientes, y montados como estático quedaban legibles sin
# autenticación para quien adivinara el nombre del archivo —que es predecible:
# `factura_{order_id}.pdf`, `presupuesto_PRES-2026-0001.pdf`—. Se sirven por
# los endpoints autenticados /api/sales/{id}/invoice/pdf y /api/quotes/{id}/pdf,
# que además filtran por inquilino. El frontend ya usaba esos endpoints: el
# montaje estático no estaba enlazado desde ninguna parte.

# Include API routes
app.include_router(api_router, prefix="/api")

if __name__ == "__main__":
    reload_env = os.environ.get("RELOAD", "").lower() in ("true", "1") or os.environ.get("ENV") == "development"
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8090,
        reload=reload_env
    )

