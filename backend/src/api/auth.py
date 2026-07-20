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

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None

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

@router.post("/login")
def login(payload: LoginRequest, request: Request):
    ip = get_client_ip(request)
    loc = get_ip_location(ip)
    user_agent = request.headers.get("User-Agent", "Desconocido")
    
    # Check user in DB
    user = database.get_user_by_username(payload.username)
    
    if user and database.verify_password(payload.password, user['password_hash']):
        # Generate token
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

# --- User Management CRUD API ---

@router.get("/users")
def list_users(current_user: dict = Depends(get_current_user)):
    try:
        return database.get_all_users()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar usuarios: {str(e)}")

@router.post("/users")
def add_user(payload: UserCreate, current_user: dict = Depends(get_current_user)):
    # Check duplicate
    existing = database.get_user_by_username(payload.username)
    if existing:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado")
        
    try:
        user_id = database.create_user(payload.username, payload.password, payload.full_name)
        return {"success": True, "user_id": user_id, "message": "Usuario creado exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear usuario: {str(e)}")

@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UserUpdate, current_user: dict = Depends(get_current_user)):
    try:
        if payload.full_name is not None:
            database.update_user_info(user_id, payload.full_name)
        if payload.password is not None and payload.password.strip() != "":
            database.update_user_password(user_id, payload.password)
        return {"success": True, "message": "Usuario actualizado exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar usuario: {str(e)}")

@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    # Prevent self-deletion
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario administrador")
        
    try:
        database.delete_user(user_id)
        return {"success": True, "message": "Usuario eliminado exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar usuario: {str(e)}")
