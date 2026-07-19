from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
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
    return {
        "is_authenticated": bool(user_id and token_valid),
        "user_id": user_id,
        "demo_mode": meli_api.is_demo_mode()
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

@router.get("/web-config")
def get_web_config():
    import json
    cfg_str = database.get_setting("web_config")
    if cfg_str:
        try:
            return json.loads(cfg_str)
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
        "footer_text": "© 2026 ControlCenterES. Todos los derechos reservados."
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
