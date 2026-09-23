import os
import json
import urllib.parse
from typing import Optional, Tuple, Any
import requests
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
import google.auth.transport.requests
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ['https://www.googleapis.com/auth/drive']
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def get_auth_url(client_id: str, redirect_uri: str, state: Optional[str] = None) -> str:
    """Genera la URL de autorización OAuth 2.0 de Google Drive."""
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive",
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    if state:
        params["state"] = state
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code_for_tokens(code: str, client_id: str, client_secret: str, redirect_uri: str) -> dict:
    """Intercambia el authorization code por access_token y refresh_token."""
    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    resp = requests.post(GOOGLE_TOKEN_URL, data=data, headers=headers, timeout=20)
    return resp.json()


def get_drive_service(
    service_account_info: Optional[dict] = None,
    oauth_info: Optional[dict] = None
) -> Tuple[Optional[Any], str]:
    """
    Obtiene el servicio de la API de Google Drive.
    Prioridad:
    1. OAuth 2.0 de usuario personal (si está configurado con refresh_token).
    2. Cuenta de Servicio (Service Account) para Google Workspace / Shared Drives.
    
    Retorna una tupla: (service_client, auth_mode) donde auth_mode es 'oauth', 'service_account' o 'none'.
    """
    from src import database, tenancy

    # 1. Verificar OAuth 2.0
    refresh_token = ""
    client_id = ""
    client_secret = ""
    access_token = ""

    if oauth_info:
        refresh_token = oauth_info.get("refresh_token", "")
        client_id = oauth_info.get("client_id", "")
        client_secret = oauth_info.get("client_secret", "")
        access_token = oauth_info.get("access_token", "")
    else:
        try:
            with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
                refresh_token = (database.get_setting("google_oauth_refresh_token", "") or "").strip()
                client_id = (os.getenv("GOOGLE_OAUTH_CLIENT_ID") or database.get_setting("google_oauth_client_id", "")).strip()
                client_secret = (os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or database.get_setting("google_oauth_client_secret", "")).strip()
                access_token = (database.get_setting("google_oauth_access_token", "") or "").strip()
        except Exception as e:
            print(f"[Google Drive] Error al leer credenciales OAuth de base de datos: {e}")

    if refresh_token and client_id and client_secret:
        try:
            creds = Credentials(
                token=access_token or None,
                refresh_token=refresh_token,
                token_uri=GOOGLE_TOKEN_URL,
                client_id=client_id,
                client_secret=client_secret,
                scopes=SCOPES
            )
            # Refrescar token proactivamente si es necesario
            request_adapter = google.auth.transport.requests.Request()
            if not creds.valid or not access_token:
                creds.refresh(request_adapter)
                # Actualizar access_token en la base de datos
                try:
                    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
                        database.set_setting("google_oauth_access_token", creds.token)
                except Exception:
                    pass

            service = build('drive', 'v3', credentials=creds, cache_discovery=False)
            return service, 'oauth'
        except Exception as e:
            print(f"[Google Drive] Error inicializando credenciales OAuth: {e}")

    # 2. Fallback a Service Account
    sa_dict = service_account_info
    if not sa_dict:
        # Intentar cargar desde service_account.json
        base_dir = os.path.realpath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
        for p in [
            os.path.join(base_dir, "service_account.json"),
            "service_account.json",
            "/var/www/controlcenter/backend/service_account.json",
        ]:
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        sa_dict = json.load(f)
                    break
                except Exception:
                    pass

    if sa_dict:
        try:
            creds = service_account.Credentials.from_service_account_info(
                sa_dict, scopes=SCOPES
            )
            service = build('drive', 'v3', credentials=creds, cache_discovery=False)
            return service, 'service_account'
        except Exception as e:
            print(f"[Google Drive] Error inicializando Service Account: {e}")

    return None, 'none'


def get_user_profile(service) -> dict:
    """Consulta los datos del usuario conectado a Google Drive."""
    try:
        about = service.about().get(fields="user, storageQuota").execute()
        user = about.get("user", {})
        quota = about.get("storageQuota", {})
        return {
            "success": True,
            "email": user.get("emailAddress", ""),
            "name": user.get("displayName", ""),
            "photo": user.get("photoLink", ""),
            "quota_limit": quota.get("limit"),
            "quota_usage": quota.get("usage"),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def upload_file(
    file_path: str,
    filename: str,
    folder_id: Optional[str] = None,
    service_account_info: Optional[dict] = None,
    oauth_info: Optional[dict] = None,
    raise_on_error: bool = False
) -> Optional[str]:
    """
    Subir un archivo a Google Drive usando OAuth 2.0 (usuario) o Service Account.
    :param file_path: Ruta local del archivo a subir.
    :param filename: Nombre que tendrá el archivo en Drive.
    :param folder_id: ID opcional de la carpeta en Drive donde se subirá. Si es None o vacío, se sube a la raíz.
    :param service_account_info: Opcional, diccionario con service_account.json.
    :param oauth_info: Opcional, diccionario con datos de OAuth.
    :param raise_on_error: Si es True, relanza la excepción original en lugar de devolver None.
    :return: El ID del archivo subido en Drive, o None si ocurre un error.
    """
    try:
        service, auth_mode = get_drive_service(
            service_account_info=service_account_info,
            oauth_info=oauth_info
        )
        if not service:
            err = Exception("No hay credenciales válidas de Google Drive configuradas (OAuth 2.0 o Service Account).")
            if raise_on_error:
                raise err
            print(f"[Google Drive API] {err}")
            return None

        file_metadata = {'name': filename}
        if folder_id and str(folder_id).strip():
            file_metadata['parents'] = [str(folder_id).strip()]

        # Determinar mimetype
        mime_type = 'application/zip' if file_path.endswith('.zip') else 'application/octet-stream'

        media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)

        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id',
            supportsAllDrives=True
        ).execute()

        file_id = uploaded_file.get('id')
        print(f"[Google Drive API] Archivo '{filename}' subido exitosamente vía {auth_mode}. ID: {file_id}")
        return file_id
    except Exception as e:
        print(f"[Google Drive API] Error subiendo archivo '{filename}': {e}")
        if raise_on_error:
            raise
        return None
