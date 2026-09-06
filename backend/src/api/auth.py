import os
import time
import secrets
import requests
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, HTTPException, Header, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional
from src import database

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    email: Optional[str] = None
    two_factor_enabled: Optional[bool] = False
    permissions: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    two_factor_enabled: Optional[bool] = None
    password: Optional[str] = None
    permissions: Optional[str] = None

class Verify2FARequest(BaseModel):
    temp_token: str
    code: str

class Resend2FARequest(BaseModel):
    temp_token: str

def mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "***"
    parts = email.split("@")
    name, domain = parts[0], parts[1]
    if len(name) <= 2:
        masked_name = name[0] + "***"
    else:
        masked_name = name[0] + "***" + name[-1]
    return f"{masked_name}@{domain}"

def build_2fa_email_html(code: str, display_name: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 24px; }}
            .card {{ max-width: 480px; margin: 0 auto; background-color: #111827; border-radius: 12px; border: 1px solid #1f2937; padding: 32px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
            .brand {{ font-size: 20px; font-weight: 700; color: #38bdf8; margin-bottom: 20px; }}
            h2 {{ color: #ffffff; font-size: 22px; margin-top: 0; margin-bottom: 12px; }}
            p {{ color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }}
            .otp-box {{ background-color: #0b0f19; border: 2px dashed #0284c7; border-radius: 10px; padding: 18px 24px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; margin: 24px 0; display: inline-block; }}
            .warning {{ font-size: 13px; color: #fbbf24; margin-bottom: 0; }}
            .footer {{ font-size: 12px; color: #64748b; margin-top: 28px; border-top: 1px solid #1f2937; padding-top: 16px; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="brand">ControlCenterES</div>
            <h2>Código de Verificación</h2>
            <p>Hola <strong>{display_name}</strong>, has solicitado iniciar sesión en tu panel de control. Utiliza el siguiente código de seguridad de 6 dígitos para completar el acceso:</p>
            <div class="otp-box">{code}</div>
            <p class="warning">⏱ Este código es válido durante <strong>10 minutos</strong> y sólo puede usarse una vez.</p>
            <div class="footer">
                Si no intentaste iniciar sesión en ControlCenterES, te sugerimos cambiar tu contraseña de inmediato.
            </div>
        </div>
    </body>
    </html>
    """

def get_client_ip(request: Request) -> str:
    """Extracts client IP address, handling proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def get_ip_location(ip: str) -> dict:
    """Performs IP geolocation lookup using ip-api.com, handling local IPs gracefully."""
    # Local/internal IPs
    if ip in ("127.0.0.1", "localhost", "::1") or ip.startswith(("192.168.", "10.", "172.16.", "172.31.")):
        return {"country": "Red Local", "region": "localhost", "city": "localhost"}
        
    try:
        res = requests.get(f"http://ip-api.com/json/{ip}", timeout=2.0)
        if res.status_code == 200:
            data = res.json()
            if data.get("status") == "success":
                return {
                    "country": data.get("country", "Desconocido"),
                    "region": data.get("regionName", "Desconocido"),
                    "city": data.get("city", "Desconocido")
                }
    except Exception:
        pass
    return {"country": "Desconocido", "region": "Desconocido", "city": "Desconocido"}

def verify_session(request: Request, authorization: str = Header(None)):
    """FastAPI dependency to secure endpoints by checking active session tokens via Header or Query Param."""
    final_token = None
    if authorization and authorization.startswith("Bearer "):
        final_token = authorization.split(" ")[1]
    else:
        final_token = request.query_params.get("token")
        
    if not final_token:
        raise HTTPException(status_code=401, detail="No autorizado: Falta token de sesión")
    if not database.validate_session(final_token):
        raise HTTPException(status_code=401, detail="No autorizado: Sesión inválida o expirada")
    return final_token

def get_current_user(token: str = Depends(verify_session)):
    """FastAPI dependency to fetch current authenticated user info."""
    user = database.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado: Usuario inválido")
    return user

def require_platform_admin(current_user: dict = Depends(get_current_user)):
    """Restringe un endpoint a los administradores de la plataforma.

    Es admin de plataforma quien pertenece al Tenant Maestro y tiene permiso de
    `settings`. La distinción importa: el administrador de un tenant cliente
    manda sobre su propio negocio, pero no debe poder dar de alta inquilinos,
    suspender suscripciones ni descargar respaldos que contienen datos de todos.
    """
    from src import tenancy

    if tenancy.get_current_tenant_id() != tenancy.MASTER_TENANT_ID:
        raise HTTPException(
            status_code=403,
            detail="Operación reservada a la administración de la plataforma")

    permissions_str = current_user.get("permissions") or ""
    allowed = [p.strip() for p in permissions_str.split(",") if p.strip()]
    if allowed and "settings" not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Se requiere permiso de configuración")
    return current_user


def require_permission(permission: str):
    """FastAPI dependency to check if the current user has the required permission."""
    def dependency(current_user: dict = Depends(get_current_user)):
        permissions_str = current_user.get("permissions") or ""
        # If permissions string is empty, default to allow everything (legacy safety)
        if not permissions_str:
            return
        allowed_list = [p.strip() for p in permissions_str.split(",") if p.strip()]
        if permission not in allowed_list:
            raise HTTPException(
                status_code=403, 
                detail=f"No tiene permisos para acceder a esta sección ({permission})"
            )
    return dependency

@router.post("/login")
def login(payload: LoginRequest, request: Request):
    ip = get_client_ip(request)
    loc = get_ip_location(ip)
    user_agent = request.headers.get("User-Agent", "Desconocido")
    
    # Check user in DB
    user = database.get_user_by_username(payload.username)
    
    if user and database.verify_password(payload.password, user['password_hash']):
        # If user has 2FA enabled, issue temporary verification code
        if user.get('two_factor_enabled'):
            user_email = (user.get('email') or '').strip()
            if not user_email:
                raise HTTPException(
                    status_code=400,
                    detail="El usuario tiene 2FA activado pero no tiene un correo configurado. Contacta al administrador para actualizar tu correo."
                )
            
            code = f"{secrets.randbelow(900000) + 100000}"
            temp_token = secrets.token_hex(32)
            
            database.create_2fa_code(user['id'], code, temp_token, expires_minutes=10)
            
            from src.utils.email_sender import send_smtp_email
            email_html = build_2fa_email_html(code, user.get('full_name') or user['username'])
            ok, err_msg = send_smtp_email(
                to_email=user_email,
                subject=f"Código de seguridad: {code} - ControlCenterES",
                html_content=email_html
            )
            if not ok:
                database.delete_2fa_code(temp_token)
                raise HTTPException(
                    status_code=500,
                    detail=f"No se pudo enviar el correo con el código de verificación: {err_msg}"
                )
                
            return {
                "success": True,
                "requires_2fa": True,
                "temp_token": temp_token,
                "masked_email": mask_email(user_email),
                "message": "Se ha enviado un código de verificación a tu correo"
            }

        # Generate token directly if 2FA is not enabled
        token = secrets.token_hex(32)
        # Session valid for 7 days
        expires_at = datetime.now() + timedelta(days=7)
        
        try:
            database.create_session(token, user['id'], expires_at)
            database.add_login_history_entry(
                username=payload.username,
                ip_address=ip,
                country=loc["country"],
                region=loc["region"],
                city=loc["city"],
                status="success",
                user_agent=user_agent
            )
            return {
                "success": True, 
                "token": token, 
                "username": user['username'],
                "full_name": user['full_name'],
                "permissions": user.get('permissions', ''),
                "message": "Autenticación exitosa"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error de sesión en DB: {str(e)}")
    else:
        # Record failed attempt
        try:
            database.add_login_history_entry(
                username=payload.username,
                ip_address=ip,
                country=loc["country"],
                region=loc["region"],
                city=loc["city"],
                status="failed",
                user_agent=user_agent
            )
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

@router.post("/verify-2fa")
def verify_2fa(payload: Verify2FARequest, request: Request):
    ip = get_client_ip(request)
    loc = get_ip_location(ip)
    user_agent = request.headers.get("User-Agent", "Desconocido")
    
    rec = database.get_2fa_record(payload.temp_token)
    if not rec:
        raise HTTPException(
            status_code=400, 
            detail="Sesión de verificación inválida o expirada. Por favor vuelve a iniciar sesión."
        )
    
    if datetime.now() > rec['expires_at']:
        database.delete_2fa_code(payload.temp_token)
        raise HTTPException(
            status_code=400, 
            detail="El código de verificación ha expirado. Solicita un nuevo código o vuelve a iniciar sesión."
        )
        
    if rec['attempts'] >= 5:
        database.delete_2fa_code(payload.temp_token)
        raise HTTPException(
            status_code=400, 
            detail="Demasiados intentos incorrectos. Por seguridad debes iniciar sesión nuevamente."
        )
        
    entered_code = payload.code.strip().replace(" ", "").replace("-", "")
    if entered_code != rec['code']:
        attempts = database.increment_2fa_attempts(payload.temp_token)
        remaining = max(0, 5 - (attempts or 1))
        raise HTTPException(
            status_code=400, 
            detail=f"Código incorrecto. Te quedan {remaining} intento(s)."
        )
        
    # Code is valid! Invalidate the temporary 2FA record
    database.delete_2fa_code(payload.temp_token)
    
    token = secrets.token_hex(32)
    expires_at = datetime.now() + timedelta(days=7)
    
    try:
        database.create_session(token, rec['user_id'], expires_at)
        database.add_login_history_entry(
            username=rec['username'],
            ip_address=ip,
            country=loc["country"],
            region=loc["region"],
            city=loc["city"],
            status="success (2FA)",
            user_agent=user_agent
        )
        return {
            "success": True, 
            "token": token, 
            "username": rec['username'],
            "full_name": rec['full_name'],
            "permissions": rec.get('permissions', ''),
            "message": "Autenticación en dos pasos exitosa"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear sesión en DB: {str(e)}")

@router.post("/resend-2fa")
def resend_2fa(payload: Resend2FARequest):
    rec = database.get_2fa_record(payload.temp_token)
    if not rec:
        raise HTTPException(status_code=400, detail="Sesión de verificación no encontrada. Inicia sesión nuevamente.")
        
    if rec.get('created_at'):
        elapsed = (datetime.now() - rec['created_at']).total_seconds()
        if elapsed < 30:
            remaining = int(30 - elapsed)
            raise HTTPException(status_code=429, detail=f"Por favor espera {remaining} segundos antes de solicitar otro código.")
            
    user_email = (rec.get('email') or '').strip()
    if not user_email:
        raise HTTPException(status_code=400, detail="El usuario no tiene un correo configurado.")
        
    new_code = f"{secrets.randbelow(900000) + 100000}"
    database.update_2fa_code(payload.temp_token, new_code, expires_minutes=10)
    
    from src.utils.email_sender import send_smtp_email
    email_html = build_2fa_email_html(new_code, rec.get('full_name') or rec['username'])
    ok, err_msg = send_smtp_email(
        to_email=user_email,
        subject=f"Nuevo código de seguridad: {new_code} - ControlCenterES",
        html_content=email_html
    )
    if not ok:
        raise HTTPException(status_code=500, detail=f"Error al enviar el correo: {err_msg}")
        
    return {
        "success": True,
        "message": f"Nuevo código enviado a {mask_email(user_email)}",
        "masked_email": mask_email(user_email)
    }

@router.post("/logout")
def logout(token: str = Depends(verify_session)):
    try:
        database.delete_session(token)
        return {"success": True, "message": "Sesión destruida"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al cerrar sesión: {str(e)}")

@router.get("/history")
def get_history(token: str = Depends(verify_session)):
    try:
        history = database.get_login_history()
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar historial: {str(e)}")

@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "full_name": current_user["full_name"],
        "email": current_user.get("email", ""),
        "two_factor_enabled": bool(current_user.get("two_factor_enabled", False)),
        "permissions": current_user.get("permissions", "")
    }

# --- User Management CRUD API ---

@router.get("/users")
def list_users(current_user: dict = Depends(get_current_user), _=Depends(require_permission("settings"))):
    try:
        return database.get_all_users()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar usuarios: {str(e)}")

@router.post("/users")
def add_user(payload: UserCreate, current_user: dict = Depends(get_current_user), _=Depends(require_permission("settings"))):
    # Check duplicate
    existing = database.get_user_by_username(payload.username)
    if existing:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado")
        
    if payload.two_factor_enabled and not (payload.email and payload.email.strip()):
        raise HTTPException(status_code=400, detail="Para activar 2FA, el usuario debe tener un correo electrónico configurado.")
        
    try:
        user_id = database.create_user(
            username=payload.username, 
            password=payload.password, 
            full_name=payload.full_name, 
            permissions=payload.permissions,
            email=payload.email,
            two_factor_enabled=payload.two_factor_enabled
        )
        return {"success": True, "user_id": user_id, "message": "Usuario creado exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear usuario: {str(e)}")

@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UserUpdate, current_user: dict = Depends(get_current_user), _=Depends(require_permission("settings"))):
    try:
        existing = database.get_user_by_id(user_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
            
        target_email = payload.email if payload.email is not None else existing.get('email')
        target_2fa = payload.two_factor_enabled if payload.two_factor_enabled is not None else existing.get('two_factor_enabled')
        if target_2fa and not (target_email and target_email.strip()):
            raise HTTPException(status_code=400, detail="Para activar 2FA se requiere un correo electrónico válido.")

        database.update_user_info(
            user_id, 
            full_name=payload.full_name,
            email=payload.email,
            two_factor_enabled=payload.two_factor_enabled
        )
        if payload.password is not None and payload.password.strip() != "":
            database.update_user_password(user_id, payload.password)
        if payload.permissions is not None:
            database.update_user_permissions(user_id, payload.permissions)
        return {"success": True, "message": "Usuario actualizado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar usuario: {str(e)}")

@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(get_current_user), _=Depends(require_permission("settings"))):
    # Prevent self-deletion
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario administrador")
        
    try:
        database.delete_user(user_id)
        return {"success": True, "message": "Usuario eliminado exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar usuario: {str(e)}")
