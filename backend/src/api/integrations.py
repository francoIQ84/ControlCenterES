"""
API de integraciones externas del tenant.

Regla de oro del módulo: **ningún endpoint devuelve una credencial**. Se puede
guardar, activar, desactivar y borrar; para leer se muestra únicamente si está
cargada y, cuando corresponde, el identificador público de la cuenta.
"""

from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src import integrations, tenancy
from src.api.auth import get_current_user, require_permission
from src.utils import crypto

router = APIRouter()


class CredentialsPayload(BaseModel):
    credentials: Dict[str, str] = Field(
        ..., description="Pares clave/valor del proveedor. Se cifran con AES-256-GCM.")
    external_account_id: Optional[str] = Field(
        None, description="Id público de la cuenta (ml_user_id, CUIT, page_id).")
    is_active: Optional[bool] = None


class ActivePayload(BaseModel):
    is_active: bool


@router.get("/")
def list_integrations(_: dict = Depends(get_current_user),
                      __=Depends(require_permission("settings"))):
    """Estado de las integraciones del tenant, sin secretos."""
    return {
        "encryption_configured": crypto.is_configured(),
        "integrations": integrations.list_integrations(),
    }


@router.put("/{provider}")
def save_integration(provider: str, payload: CredentialsPayload,
                     _: dict = Depends(get_current_user),
                     __=Depends(require_permission("settings"))):
    if not crypto.is_configured():
        raise HTTPException(
            status_code=503,
            detail="El cifrado de credenciales no está configurado en el servidor "
                   "(falta CREDENTIALS_ENCRYPTION_KEY). No se guardan secretos en claro.")

    if not payload.credentials:
        raise HTTPException(status_code=400, detail="No se enviaron credenciales")

    try:
        saved = integrations.save_credentials(
            provider,
            payload.credentials,
            external_account_id=payload.external_account_id,
            is_active=payload.is_active,
        )
    except integrations.UnknownProvider as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "success": True,
        "integration": saved,
        "stored_fields": sorted(payload.credentials.keys()),
        "message": f"Credenciales de {provider} guardadas y cifradas.",
    }


@router.patch("/{provider}/active")
def set_integration_active(provider: str, payload: ActivePayload,
                           _: dict = Depends(get_current_user),
                           __=Depends(require_permission("settings"))):
    try:
        found = integrations.set_active(provider, payload.is_active)
    except integrations.UnknownProvider as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not found:
        raise HTTPException(status_code=404,
                            detail=f"El tenant no tiene configurado {provider}")
    return {"success": True, "provider": provider, "is_active": payload.is_active}


@router.post("/{provider}/migrate-legacy")
def migrate_legacy(provider: str,
                   _: dict = Depends(get_current_user),
                   __=Depends(require_permission("settings"))):
    """Pasa las credenciales que viven en `settings` a almacenamiento cifrado.

    No borra las originales: si algo falla, la integración sigue andando por el
    camino de compatibilidad.
    """
    if not crypto.is_configured():
        raise HTTPException(status_code=503,
                            detail="Falta CREDENTIALS_ENCRYPTION_KEY en el servidor")
    try:
        migrated = integrations.migrate_legacy_credentials(provider)
    except integrations.UnknownProvider as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not migrated:
        return {"success": False,
                "message": f"No hay credenciales heredadas de {provider} para migrar."}
    return {"success": True,
            "message": f"Credenciales de {provider} migradas y cifradas. "
                       f"Las claves originales en `settings` siguen ahí como respaldo."}


@router.delete("/{provider}")
def delete_integration(provider: str,
                       _: dict = Depends(get_current_user),
                       __=Depends(require_permission("settings"))):
    try:
        deleted = integrations.delete_integration(provider)
    except integrations.UnknownProvider as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404,
                            detail=f"El tenant no tiene configurado {provider}")
    return {"success": True, "message": f"Integración {provider} eliminada."}
