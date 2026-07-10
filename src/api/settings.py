from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src import database, meli_api, config

router = APIRouter()

class SetupRequest(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: str

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
        "redirect_uri": database.get_setting('meli_redirect_uri', 'https://localhost:8088')
    }

@router.post("/setup")
def save_setup(req: SetupRequest):
    database.set_setting('meli_client_id', req.client_id)
    database.set_setting('meli_client_secret', req.client_secret)
    database.set_setting('meli_redirect_uri', req.redirect_uri)
    return {"success": True}

@router.post("/exchange-code")
def exchange_code(req: CodeRequest):
    ok, err = meli_api.exchange_code(req.code)
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
