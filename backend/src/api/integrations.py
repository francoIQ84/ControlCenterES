"""
API de integraciones externas del tenant.

Regla de oro del módulo: **ningún endpoint devuelve una credencial**. Se puede
guardar, activar, desactivar y borrar; para leer se muestra únicamente si está
cargada y, cuando corresponde, el identificador público de la cuenta.
"""

from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src import integrations, sync_state, tenancy
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


class ResetCursorPayload(BaseModel):
    cursor_at: Optional[str] = Field(
        None,
        description="Fecha ISO desde la cual volver a sincronizar. "
                    "Vacío = arrancar de cero (el canal se trata como nuevo).")


@router.get("/")
def list_integrations(_: dict = Depends(get_current_user),
                      __=Depends(require_permission("settings"))):
    """Estado de las integraciones del tenant, sin secretos."""
    return {
        "encryption_configured": crypto.is_configured(),
        "integrations": integrations.list_integrations(),
    }


# ---------------------------------------------------------------------------
# Registro de sincronización
#
# Declarados antes de las rutas con `{provider}` para que FastAPI no interprete
# "sync-state" como el nombre de un proveedor.
# ---------------------------------------------------------------------------

@router.get("/sync-state")
def get_sync_state(_: dict = Depends(get_current_user),
                   __=Depends(require_permission("settings"))):
    """Última actualización de cada canal y desde cuándo sigue la próxima."""
    return {
        "states": sync_state.list_states(),
        "lookback_days": sync_state.DEFAULT_LOOKBACK_DAYS,
        "overlap_minutes": sync_state.DEFAULT_OVERLAP_MINUTES,
    }


@router.get("/sync-log")
def get_sync_log(provider: Optional[str] = None,
                 resource: Optional[str] = None,
                 limit: int = Query(50, ge=1, le=500),
                 _: dict = Depends(get_current_user),
                 __=Depends(require_permission("settings"))):
    """Historial de corridas del tenant, para auditar y diagnosticar."""
    return {
        "runs": sync_state.list_runs(provider=provider, resource=resource,
                                     limit=limit),
        "retention_days": sync_state.LOG_RETENTION_DAYS,
    }


@router.post("/sync-state/{provider}/{resource}/reset")
def reset_sync_cursor(provider: str, resource: str,
                      payload: ResetCursorPayload,
                      _: dict = Depends(get_current_user),
                      __=Depends(require_permission("settings"))):
    """Rebobina (o borra) la marca de agua de un canal.

    Es la salida cuando un canal quedó apuntando a una fecha equivocada: en vez
    de tocar la base a mano, se le dice desde cuándo volver a traer.
    """
    cursor_at = None
    if payload.cursor_at:
        try:
            cursor_at = datetime.fromisoformat(payload.cursor_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400,
                                detail="cursor_at tiene que ser una fecha ISO válida")

    try:
        ok = sync_state.reset_state(provider, resource, cursor_at)
    except sync_state.UnknownResource as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not ok:
        raise HTTPException(
            status_code=503,
            detail="El registro de sincronización no está disponible "
                   "(falta aplicar la migración 015).")

    return {
        "success": True,
        "provider": provider,
        "resource": resource,
        "cursor_at": cursor_at.isoformat() if cursor_at else None,
        "message": ("La próxima sincronización arranca desde "
                    f"{cursor_at.isoformat()}." if cursor_at else
                    "Marca de agua borrada: la próxima sincronización usa la "
                    f"ventana por defecto de {sync_state.DEFAULT_LOOKBACK_DAYS} días."),
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
