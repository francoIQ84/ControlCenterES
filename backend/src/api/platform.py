import os
import json
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional, Dict
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File

from src import database, tenancy
from src.api.auth import require_platform_admin

router = APIRouter()


class PlatformCredentialsPayload(BaseModel):
    meli_app_id: Optional[str] = None
    meli_client_secret: Optional[str] = None
    meta_app_id: Optional[str] = None
    meta_app_secret: Optional[str] = None
    tiendanube_client_id: Optional[str] = None
    tiendanube_client_secret: Optional[str] = None
    gemini_api_key: Optional[str] = None
    google_drive_folder_id: Optional[str] = None
    public_base_url: Optional[str] = None


def _get_service_account_path() -> str:
    possible_paths = [
        "service_account.json",
        "/var/www/controlcenter/backend/service_account.json",
        os.path.join(os.getcwd(), "service_account.json")
    ]
    for p in possible_paths:
        if os.path.exists(p):
            return p
    return "service_account.json"


@router.get("/credentials")
def get_platform_credentials(_: dict = Depends(require_platform_admin)):
    """Obtiene el estado de las credenciales globales de infraestructura del desarrollador."""
    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        meli_app_id = (os.getenv("MELI_APP_ID") or database.get_setting("meli_app_id", "") or database.get_setting("meli_client_id", "")).strip()
        meli_secret = (os.getenv("MELI_CLIENT_SECRET") or database.get_setting("meli_client_secret", "")).strip()

        meta_app_id = (os.getenv("META_APP_ID") or database.get_setting("meta_app_id", "")).strip()
        meta_secret = (os.getenv("META_APP_SECRET") or database.get_setting("meta_app_secret", "")).strip()

        tn_client_id = (os.getenv("TIENDANUBE_CLIENT_ID") or database.get_setting("tiendanube_client_id", "") or database.get_setting("tn_client_id", "")).strip()
        tn_secret = (os.getenv("TIENDANUBE_CLIENT_SECRET") or database.get_setting("tiendanube_client_secret", "") or database.get_setting("tn_client_secret", "")).strip()

        gemini_key = database.get_platform_setting("gemini_api_key", "GEMINI_API_KEY")

        gdrive_folder = (os.getenv("GOOGLE_DRIVE_FOLDER_ID") or database.get_setting("google_drive_folder_id", "")).strip()

        public_url = (os.getenv("PUBLIC_BASE_URL") or database.get_setting("public_base_url", "https://es.focalserver.com")).strip()

    sa_path = _get_service_account_path()
    has_sa = os.path.exists(sa_path)
    sa_client_email = ""
    if has_sa:
        try:
            with open(sa_path, "r", encoding="utf-8") as f:
                sa_data = json.load(f)
                sa_client_email = sa_data.get("client_email", "")
        except Exception:
            pass

    clean_public_url = public_url.rstrip("/")

    return {
        "meli_app_id": meli_app_id,
        "has_meli_client_secret": bool(meli_secret),
        "meta_app_id": meta_app_id,
        "has_meta_app_secret": bool(meta_secret),
        "tiendanube_client_id": tn_client_id,
        "has_tiendanube_client_secret": bool(tn_secret),
        "has_gemini_api_key": bool(gemini_key),
        "google_drive_folder_id": gdrive_folder,
        "has_service_account": has_sa,
        "service_account_email": sa_client_email,
        "public_base_url": clean_public_url,
        "redirect_uris": {
            "mercadolibre": f"{clean_public_url}/api/settings/meli-callback",
            "meta": f"{clean_public_url}/api/marketing/oauth-callback",
            "tiendanube": f"{clean_public_url}/api/tiendanube/callback"
        }
    }


@router.post("/credentials")
def save_platform_credentials(payload: PlatformCredentialsPayload,
                              _: dict = Depends(require_platform_admin)):
    """Guarda o actualiza credenciales globales en el contexto del Master Tenant."""
    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        if payload.meli_app_id is not None:
            database.set_setting("meli_app_id", payload.meli_app_id.strip())
            database.set_setting("meli_client_id", payload.meli_app_id.strip())
        if payload.meli_client_secret is not None:
            secret = payload.meli_client_secret.strip()
            if secret and not secret.startswith("••"):
                database.set_setting("meli_client_secret", secret)

        if payload.meta_app_id is not None:
            database.set_setting("meta_app_id", payload.meta_app_id.strip())
        if payload.meta_app_secret is not None:
            secret = payload.meta_app_secret.strip()
            if secret and not secret.startswith("••"):
                database.set_setting("meta_app_secret", secret)

        if payload.tiendanube_client_id is not None:
            database.set_setting("tiendanube_client_id", payload.tiendanube_client_id.strip())
            database.set_setting("tn_client_id", payload.tiendanube_client_id.strip())
        if payload.tiendanube_client_secret is not None:
            secret = payload.tiendanube_client_secret.strip()
            if secret and not secret.startswith("••"):
                database.set_setting("tiendanube_client_secret", secret)
                database.set_setting("tn_client_secret", secret)

        if payload.gemini_api_key is not None:
            key = payload.gemini_api_key.strip()
            if key and not key.startswith("••"):
                database.set_setting("gemini_api_key", key)

        if payload.google_drive_folder_id is not None:
            database.set_setting("google_drive_folder_id", payload.google_drive_folder_id.strip())

        if payload.public_base_url is not None:
            database.set_setting("public_base_url", payload.public_base_url.strip())

    return {"success": True, "message": "Credenciales de plataforma actualizadas exitosamente."}


@router.post("/upload-service-account")
async def upload_service_account(file: UploadFile = File(...),
                                 _: dict = Depends(require_platform_admin)):
    """Sube el archivo service_account.json para Google Drive."""
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
        if not data.get("client_email") or not data.get("private_key"):
            raise HTTPException(
                status_code=400,
                detail="El archivo JSON no parece ser una clave de Service Account válida de Google (falta client_email o private_key)."
            )

        # Guardar en service_account.json en el directorio de trabajo del backend
        target_path = "service_account.json"
        with open(target_path, "wb") as f:
            f.write(content)

        return {
            "success": True,
            "message": f"Service account cargada con éxito: {data.get('client_email')}",
            "client_email": data.get("client_email")
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El archivo subido no es un JSON válido.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando service_account.json: {str(e)}")


@router.post("/test/{service}")
def test_platform_service(service: str, _: dict = Depends(require_platform_admin)):
    """Prueba la conectividad y validez de las credenciales de un servicio específico."""
    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        meli_app_id = (os.getenv("MELI_APP_ID") or database.get_setting("meli_app_id", "")).strip()
        meli_secret = (os.getenv("MELI_CLIENT_SECRET") or database.get_setting("meli_client_secret", "")).strip()

        meta_app_id = (os.getenv("META_APP_ID") or database.get_setting("meta_app_id", "")).strip()
        meta_secret = (os.getenv("META_APP_SECRET") or database.get_setting("meta_app_secret", "")).strip()

        tn_client_id = (os.getenv("TIENDANUBE_CLIENT_ID") or database.get_setting("tiendanube_client_id", "")).strip()
        tn_secret = (os.getenv("TIENDANUBE_CLIENT_SECRET") or database.get_setting("tiendanube_client_secret", "")).strip()

        gemini_key = database.get_platform_setting("gemini_api_key", "GEMINI_API_KEY")

        gdrive_folder = (os.getenv("GOOGLE_DRIVE_FOLDER_ID") or database.get_setting("google_drive_folder_id", "")).strip()

    if service == "gemini":
        if not gemini_key:
            return {"success": False, "message": "GEMINI_API_KEY no está configurada."}
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={gemini_key}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = [m.get("name") for m in data.get("models", []) if "gemini" in m.get("name", "")]
                return {
                    "success": True,
                    "message": f"Conexión con Gemini AI exitosa. Modelos disponibles: {len(models)}"
                }
        except Exception as e:
            return {"success": False, "message": f"Error validando Gemini API Key: {str(e)}"}

    elif service == "meta":
        if not meta_app_id or not meta_secret:
            return {"success": False, "message": "META_APP_ID o META_APP_SECRET no están configurados."}
        try:
            # Validar con endpoint client_credentials de Meta
            url = (f"https://graph.facebook.com/oauth/access_token?"
                   f"client_id={meta_app_id}&client_secret={meta_secret}&grant_type=client_credentials")
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("access_token"):
                    return {
                        "success": True,
                        "message": f"Credenciales de Meta válidas. App Token obtenido correctamente."
                    }
                return {"success": False, "message": "Respuesta inesperada de Meta API."}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            return {"success": False, "message": f"Meta rechazó las credenciales ({e.code}): {err_body}"}
        except Exception as e:
            return {"success": False, "message": f"Error probando Meta API: {str(e)}"}

    elif service == "mercadolibre":
        if not meli_app_id:
            return {"success": False, "message": "MELI_APP_ID no está configurado."}
        try:
            # Consultar información pública de la app en Meli
            url = f"https://api.mercadolibre.com/applications/{meli_app_id}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                app_name = data.get("name", meli_app_id)
                has_secret_msg = "Client Secret configurado." if meli_secret else "Falta Client Secret."
                return {
                    "success": True,
                    "message": f"App de Mercado Libre encontrada: '{app_name}'. {has_secret_msg}"
                }
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"success": False, "message": f"App ID {meli_app_id} no existe en Mercado Libre."}
            return {"success": False, "message": f"Error consultando Mercado Libre ({e.code})"}
        except Exception as e:
            return {"success": False, "message": f"Error conectando con Mercado Libre: {str(e)}"}

    elif service == "tiendanube":
        if not tn_client_id or not tn_secret:
            return {"success": False, "message": "TIENDANUBE_CLIENT_ID o TIENDANUBE_CLIENT_SECRET no configurados."}
        return {
            "success": True,
            "message": f"Credenciales de Tiendanube presentes (Client ID: {tn_client_id})."
        }

    elif service == "google_drive":
        sa_path = _get_service_account_path()
        if not os.path.exists(sa_path):
            return {"success": False, "message": "No se encontró el archivo service_account.json."}
        if not gdrive_folder:
            return {"success": False, "message": "GOOGLE_DRIVE_FOLDER_ID no está configurado."}
        try:
            with open(sa_path, "r", encoding="utf-8") as f:
                sa_data = json.load(f)
            return {
                "success": True,
                "message": f"Service Account válida ({sa_data.get('client_email')}). Folder ID: {gdrive_folder}"
            }
        except Exception as e:
            return {"success": False, "message": f"Error leyendo service_account.json: {str(e)}"}

    raise HTTPException(status_code=400, detail=f"Servicio desconocido: {service}")
