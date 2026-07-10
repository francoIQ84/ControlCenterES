from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src import database, meli_api, config

router = APIRouter()

class SetupRequest(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: str
    demo_mode: bool

class CodeRequest(BaseModel):
    code: str

@router.get("/status")
def get_auth_status():
    user_id = config.get_user_id()
    token_valid = meli_api.validate_token()
    return {
        "is_authenticated": bool(user_id and token_valid),
        "user_id": user_id
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
