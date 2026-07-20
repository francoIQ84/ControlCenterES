from fastapi import APIRouter, HTTPException, BackgroundTasks, File, UploadFile
from pydantic import BaseModel
import os
from typing import Optional
from src import database, meli_api, config
from src.progress import get_progress, update_progress

router = APIRouter()

class SetupRequest(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: str
    demo_mode: bool

class CodeRequest(BaseModel):
    code: str

class SyncAllRequest(BaseModel):
    limit: int = 2000
    date_from: Optional[str] = None

@router.get("/status")
def get_auth_status():
    user_id = config.get_user_id()
    token_valid = meli_api.validate_token()
    
    afip_enabled = database.get_setting('afip_enabled', '0') == '1'
    cert_exists = os.path.exists("backend/data/afip/arca.crt")
    key_exists = os.path.exists("backend/data/afip/arca.key")
    
    return {
        "is_authenticated": bool(user_id and token_valid),
        "user_id": user_id,
        "demo_mode": meli_api.is_demo_mode(),
        "afip_active": afip_enabled and cert_exists and key_exists
    }

@router.get("/config")
def get_config():
    return {
        "client_id": database.get_setting('meli_client_id', ''),
        "client_secret": database.get_setting('meli_client_secret', ''),
        "redirect_uri": database.get_setting('meli_redirect_uri', 'https://lvh.me:8090/meli_callback'),
        "demo_mode": database.get_setting('demo_mode', '1') == '1'
    }

@router.post("/setup")
def save_setup(req: SetupRequest):
    # Clear active session tokens to force clean re-authentication with new settings
    database.delete_setting('meli_access_token')
    database.delete_setting('meli_refresh_token')
    database.delete_setting('meli_user_id')
    database.delete_setting('meli_token_expiry')
    
    database.set_setting('meli_client_id', req.client_id)
    database.set_setting('meli_client_secret', req.client_secret)
    database.set_setting('meli_redirect_uri', req.redirect_uri)
    database.set_setting('demo_mode', '1' if req.demo_mode else '0')
    return {"success": True}

@router.post("/exchange-code")
def exchange_code(req: CodeRequest):
    ok, err = meli_api.authenticate_with_code(req.code)
    if ok:
        return {"success": True}
    else:
        raise HTTPException(status_code=400, detail=err)

@router.post("/logout")
def logout():
    database.delete_setting('meli_access_token')
    database.delete_setting('meli_refresh_token')
    database.delete_setting('meli_user_id')
    database.clear_all_caches()
    return {"success": True}

class WebConfigModel(BaseModel):
    store_name: str
    logo_url: str
    hero_title: str
    hero_subtitle: str
    hero_image: str
    contact_phone: str
    address: str
    footer_text: str
    favicon_url: Optional[str] = ""

@router.get("/web-config")
def get_web_config():
    import json
    cfg_str = database.get_setting("web_config")
    if cfg_str:
        try:
            cfg = json.loads(cfg_str)
            if "favicon_url" not in cfg:
                cfg["favicon_url"] = ""
            return cfg
        except Exception:
            pass
    return {
        "store_name": "Tienda Oficial",
        "logo_url": "",
        "hero_title": "Nuestra Tienda Oficial",
        "hero_subtitle": "Los mejores productos directo de fábrica, al mejor precio.",
        "hero_image": "",
        "contact_phone": "",
        "address": "",
        "footer_text": "© 2026 ControlCenterES. Todos los derechos reservados.",
        "favicon_url": ""
    }

@router.post("/web-config")
def save_web_config(req: WebConfigModel):
    import json
    database.set_setting("web_config", json.dumps(req.dict()))
    return {"success": True}

def run_background_sync(limit: int, date_from: Optional[str]):
    try:
        # Step 1: Products Sync
        ok_products, count_or_msg = meli_api.sync_products()
        if not ok_products:
            raise Exception(f"Fallo en la sincronización de productos: {count_or_msg}")
            
        # Step 2: Sales Sync
        ok_sales, count_or_msg = meli_api.sync_orders(limit=limit, date_from=date_from)
        if not ok_sales:
            raise Exception(f"Fallo en la sincronización de ventas: {count_or_msg}")
            
        # Finalized successfully
        update_progress(status="completed", progress=100, message="Sincronización histórica finalizada exitosamente.")
    except Exception as e:
        update_progress(status="failed", message=str(e))

@router.post("/sync-all")
def trigger_sync_all(req: SyncAllRequest, background_tasks: BackgroundTasks):
    current_status = get_progress().get("status")
    if current_status in ["syncing_products", "syncing_sales"]:
        return {"success": True, "message": "Sincronización ya en curso."}
        
    update_progress(status="idle", progress=0, message="Iniciando...", current=0, total=100)
    background_tasks.add_task(run_background_sync, req.limit, req.date_from)
    return {"success": True, "message": "Sincronización en segundo plano iniciada."}

@router.get("/sync-progress")
def get_sync_progress():
    return get_progress()

class ArcaConfigRequest(BaseModel):
    afip_enabled: bool
    afip_cuit: str
    afip_pto_vta: int
    afip_type_cmp: int
    afip_concept: int
    afip_environment: str
    merchant_name: str
    merchant_address: str
    merchant_phone: str
    merchant_iibb: str = ''
    merchant_iva_condition: str = 'Responsable Monotributo'
    merchant_start_date: str = ''

class CsrRequest(BaseModel):
    cuit: str
    company_name: str

@router.get("/arca-config")
def get_arca_config():
    cert_exists = os.path.exists("backend/data/afip/arca.crt")
    key_exists = os.path.exists("backend/data/afip/arca.key")
    return {
        "afip_enabled": database.get_setting('afip_enabled', '0') == '1',
        "afip_cuit": database.get_setting('afip_cuit', ''),
        "afip_pto_vta": int(database.get_setting('afip_pto_vta', '1')),
        "afip_type_cmp": int(database.get_setting('afip_type_cmp', '11')),
        "afip_concept": int(database.get_setting('afip_concept', '1')),
        "afip_environment": database.get_setting('afip_environment', 'homologacion'),
        "merchant_name": database.get_setting('merchant_name', 'Hidroponia Rosario'),
        "merchant_address": database.get_setting('merchant_address', 'Bv. Oroño 4500, Rosario'),
        "merchant_phone": database.get_setting('merchant_phone', '+54 341 456-7890'),
        "merchant_iibb": database.get_setting('merchant_iibb', ''),
        "merchant_iva_condition": database.get_setting('merchant_iva_condition', 'Responsable Monotributo'),
        "merchant_start_date": database.get_setting('merchant_start_date', '01/01/2020'),
        "afip_cert_uploaded": cert_exists,
        "afip_key_generated": key_exists
    }

@router.post("/arca-config")
def save_arca_config(req: ArcaConfigRequest):
    database.set_setting('afip_enabled', '1' if req.afip_enabled else '0')
    database.set_setting('afip_cuit', req.afip_cuit.strip())
    database.set_setting('afip_pto_vta', str(req.afip_pto_vta))
    database.set_setting('afip_type_cmp', str(req.afip_type_cmp))
    database.set_setting('afip_concept', str(req.afip_concept))
    database.set_setting('afip_environment', req.afip_environment)
    database.set_setting('merchant_name', req.merchant_name.strip())
    database.set_setting('merchant_address', req.merchant_address.strip())
    database.set_setting('merchant_phone', req.merchant_phone.strip())
    database.set_setting('merchant_iibb', req.merchant_iibb.strip())
    database.set_setting('merchant_iva_condition', req.merchant_iva_condition.strip())
    database.set_setting('merchant_start_date', req.merchant_start_date.strip())
    return {"success": True}

@router.post("/arca-generate-csr")
def generate_arca_csr(req: CsrRequest):
    try:
        from src.utils.afip_ws import generate_csr_and_key
        csr_pem, _ = generate_csr_and_key(req.cuit, req.company_name)
        return {"success": True, "csr": csr_pem}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/arca-upload-cert")
def upload_arca_cert(file: UploadFile = File(...)):
    try:
        os.makedirs("backend/data/afip", exist_ok=True)
        cert_path = "backend/data/afip/arca.crt"
        with open(cert_path, "wb") as f:
            f.write(file.file.read())
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/arca-cuit-lookup")
def arca_cuit_lookup(cuit: str, env: Optional[str] = None):
    try:
        from src.utils.afip_ws import lookup_cuit
        res = lookup_cuit(cuit, env=env)
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Error desconocido al buscar CUIT"))
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
