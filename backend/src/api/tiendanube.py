"""
Rutas de API para la integración con Tiendanube (Nuvemshop).

Incluye:
- Flujo de autorización OAuth 2.0 en 1 clic y callback.
- Receptor público de Webhooks multi-tenant en tiempo real.
- Exportación masiva de catálogo con reporte de progreso en vivo.
- Exportación de identidad de marca (logo, contacto, redes).
- Sincronización manual de pedidos y estado de conexión.
"""

import threading
from typing import Optional
import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from src import tn_api, database, integrations, tenancy, progress
from src.api.auth import get_current_user, require_permission

router = APIRouter()


class ExportCatalogRequest(BaseModel):
    price_source: str = Field("auto", description="Origen del precio: 'auto', 'web', o 'list'")
    only_with_stock: bool = Field(False, description="Exportar solo productos con stock disponible")
    price_modifier_pct: float = Field(0.0, description="Porcentaje de recargo o descuento (ej: -5.0 o 10.0)")
    sync_branding: bool = Field(True, description="Sincronizar también el logo y datos de contacto")


class SyncOrdersRequest(BaseModel):
    limit: int = Field(50, description="Cantidad máxima de órdenes a consultar")
    date_from: Optional[str] = Field(None, description="Fecha mínima en formato ISO")


class TnConfigRequest(BaseModel):
    client_id: str
    client_secret: str


class TnManualTokenRequest(BaseModel):
    access_token: str
    store_id: str


# ---------------------------------------------------------------------------
# Estado de la Integración y Configuración
# ---------------------------------------------------------------------------

@router.get("/config")
def get_tn_config(_: dict = Depends(get_current_user),
                  __=Depends(require_permission("settings"))):
    return {
        "client_id": tn_api.get_client_id(),
        "client_secret": tn_api.get_client_secret(),
        "redirect_uri": "https://admin.hidroponiarosario.com/api/tiendanube/callback"
    }


@router.post("/config")
def save_tn_config(req: TnConfigRequest,
                   _: dict = Depends(get_current_user),
                   __=Depends(require_permission("settings"))):
    database.set_setting("tn_client_id", req.client_id.strip())
    database.set_setting("tn_client_secret", req.client_secret.strip())
    return {"success": True, "message": "Credenciales de Tiendanube guardadas correctamente."}


@router.post("/manual-token")
def save_manual_token(req: TnManualTokenRequest,
                      _: dict = Depends(get_current_user),
                      __=Depends(require_permission("settings"))):
    token = req.access_token.strip()
    store_id = req.store_id.strip()
    if not token or not store_id:
        raise HTTPException(status_code=400, detail="access_token y store_id son requeridos.")

    # Validar conectividad contra la API de Tiendanube con este token y store_id
    headers = {
        "Authentication": f"bearer {token}",
        "User-Agent": tn_api.DEFAULT_USER_AGENT
    }
    url = f"https://api.tiendanube.com/v1/{store_id}/products?limit=1"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Tiendanube rechazó el token (HTTP {r.status_code}): {r.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al verificar credenciales con Tiendanube: {str(e)}")

    client_id = tn_api.get_client_id()
    integrations.save_credentials("tiendanube", {
        "client_id": client_id,
        "access_token": token,
        "store_id": store_id,
        "user_id": store_id,
        "token_type": "bearer"
    }, external_account_id=store_id, is_active=True)

    database.set_setting("tn_access_token", token)
    database.set_setting("tn_store_id", store_id)

    try:
        tn_api.register_all_webhooks(store_id, token)
    except Exception:
        pass

    return {"success": True, "message": f"¡Tiendanube conectada exitosamente para la tienda #{store_id}!"}


@router.delete("/disconnect")
@router.post("/disconnect")
def disconnect_tiendanube(_: dict = Depends(get_current_user),
                          __=Depends(require_permission("settings"))):
    integrations.delete_credentials("tiendanube")
    database.delete_setting("tn_access_token")
    database.delete_setting("tn_store_id")
    database.delete_setting("tn_client_id")
    database.delete_setting("tn_client_secret")
    return {"success": True, "message": "Tiendanube desvinculada exitosamente."}


@router.get("/status")
def get_tiendanube_status(_: dict = Depends(get_current_user),
                          __=Depends(require_permission("settings"))):
    """Devuelve el estado de vinculación y métricas de Tiendanube del tenant activo."""
    creds = tn_api.get_credentials()
    store_id = tn_api.get_store_id()
    is_conn = tn_api.is_connected()
    is_demo = tn_api.is_demo_mode()

    # Contar productos sincronizados con Tiendanube
    all_prods = database.get_all_products(include_hidden=True)
    total_local = len(all_prods)
    synced_tn = sum(1 for p in all_prods if p.get("tn_id"))

    return {
        "is_connected": is_conn,
        "is_demo_mode": is_demo,
        "store_id": store_id,
        "total_local_products": total_local,
        "synced_products_count": synced_tn,
        "last_sync_at": creds.get("last_sync_at") if creds else None,
        "client_id_configured": bool(tn_api.get_client_id()),
        "auth_url": tn_api.get_auth_url() if tn_api.get_client_id() else None
    }


# ---------------------------------------------------------------------------
# Flujo OAuth 2.0 (1 Clic)
# ---------------------------------------------------------------------------

@router.get("/auth-url")
def get_authorization_url(_: dict = Depends(get_current_user),
                           __=Depends(require_permission("settings"))):
    """Genera la URL para iniciar la conexión con 1 clic."""
    url = tn_api.get_auth_url()
    return {"auth_url": url}


@router.get("/callback")
def oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Callback receptor de Tiendanube luego de que el usuario autoriza la app."""
    if error:
        return RedirectResponse(url=f"/settings?tab=connection&tn_error={error}")

    if not code:
        return RedirectResponse(url="/settings?tab=connection&tn_error=no_code")

    # Si vino el tenant en el parámetro state, ejecutar bajo su contexto
    tenant_id = state or tenancy.get_current_tenant_id()

    with tenancy.tenant_context(tenant_id):
        ok, msg = tn_api.authenticate_with_code(code)
        if ok:
            return RedirectResponse(url="/settings?tab=connection&tn_status=success")
        else:
            return RedirectResponse(url=f"/settings?tab=connection&tn_error={msg}")


# ---------------------------------------------------------------------------
# Receptor de Webhooks de Tiendanube (Multi-tenant & Real-time)
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def tiendanube_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receptor público de notificaciones en tiempo real de Tiendanube."""
    raw_body = await request.body()
    hmac_header = request.headers.get("X-LinkedStore-HMAC-SHA256", "")

    # Validar firma HMAC si está configurada
    if hmac_header and not tn_api.verify_webhook_hmac(raw_body, hmac_header):
        raise HTTPException(status_code=401, detail="Firma HMAC de Tiendanube inválida")

    try:
        data = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return Response(status_code=200, content="OK (Invalid JSON)")

    event = data.get("event") or request.headers.get("X-LinkedStore-Topic", "")
    store_id = str(data.get("store_id") or data.get("user_id") or "")

    if not store_id and isinstance(data.get("order"), dict):
        store_id = str(data["order"].get("store_id", ""))

    # Resolver a qué tenant pertenece la tienda
    tenant_id = integrations.resolve_tenant_by_account("tiendanube", store_id)
    if not tenant_id:
        print(f"[Tiendanube Webhook] Tienda #{store_id} no encontrada en ningún tenant activo.")
        return Response(status_code=200, content="Store Not Found")

    # Procesar el evento en el contexto del inquilino
    def _process_event_async(tid: str, evt: str, payload: dict):
        with tenancy.tenant_context(tid):
            try:
                if evt in ("order/created", "order/paid", "order/updated"):
                    order_obj = payload.get("order") or payload
                    tn_api.parse_and_save_tn_order(order_obj)
                    print(f"[Tiendanube Webhook] Evento {evt} procesado para tenant {tid}")
                elif evt == "app/uninstalled":
                    integrations.set_active("tiendanube", False)
                    print(f"[Tiendanube Webhook] App desinstalada en tienda #{store_id} para tenant {tid}")
            except Exception as exc:
                print(f"[Tiendanube Webhook Background Error] {exc}")

    background_tasks.add_task(_process_event_async, tenant_id, event, data)
    return Response(status_code=200, content="OK")


# ---------------------------------------------------------------------------
# Exportación Masiva de Catálogo (Poblado de Tienda Vacía)
# ---------------------------------------------------------------------------

@router.post("/export-catalog")
def export_catalog(payload: ExportCatalogRequest,
                   background_tasks: BackgroundTasks,
                   _: dict = Depends(get_current_user),
                   __=Depends(require_permission("inventory"))):
    """Inicia la exportación masiva del catálogo hacia Tiendanube en segundo plano."""
    tenant_id = tenancy.get_current_tenant_id()

    progress.update_progress(
        status="syncing_products",
        progress=0,
        message="Iniciando exportación de catálogo a Tiendanube...",
        current=0,
        total=100
    )

    def _run_export():
        with tenancy.tenant_context(tenant_id):
            try:
                def _prog(current, total, message):
                    pct = int((current / max(1, total)) * 100)
                    progress.update_progress(
                        status="syncing_products",
                        progress=pct,
                        message=message,
                        current=current,
                        total=total
                    )

                res = tn_api.export_catalog_to_tn(
                    price_source=payload.price_source,
                    only_with_stock=payload.only_with_stock,
                    price_modifier_pct=payload.price_modifier_pct,
                    progress_callback=_prog
                )
                progress.update_progress(
                    status="completed",
                    progress=100,
                    message=f"Exportación finalizada: {res.get('created', 0)} creados, {res.get('updated', 0)} actualizados.",
                    current=res.get("total", 0),
                    total=res.get("total", 0)
                )
            except Exception as exc:
                print(f"[Tiendanube Export Error] {exc}")
                progress.update_progress(
                    status="failed",
                    progress=0,
                    message=f"Error durante la exportación: {str(exc)}"
                )

    background_tasks.add_task(_run_export)
    return {"success": True, "message": "Exportación de catálogo iniciada en segundo plano."}


@router.get("/export-progress")
def get_export_progress(_: dict = Depends(get_current_user)):
    """Consulta el progreso actual de la exportación de catálogo."""
    return progress.get_progress()


# ---------------------------------------------------------------------------
# Sincronización Manual de Pedidos y Branding
# ---------------------------------------------------------------------------

@router.post("/sync-orders")
def sync_orders_manual(payload: SyncOrdersRequest,
                       _: dict = Depends(get_current_user),
                       __=Depends(require_permission("sales"))):
    """Fuerza la sincronización de órdenes recientes desde Tiendanube."""
    ok, count = tn_api.sync_orders(limit=payload.limit, date_from=payload.date_from)
    if ok:
        return {"success": True, "count": count, "message": f"Sincronización completada ({count} órdenes procesadas)."}
    raise HTTPException(status_code=500, detail="Error al sincronizar pedidos de Tiendanube")


@router.post("/export-branding")
def export_branding(_: dict = Depends(get_current_user),
                    __=Depends(require_permission("settings"))):
    """Sincroniza el logo y datos de contacto oficiales hacia Tiendanube."""
    ok, msg = tn_api.export_store_branding_to_tn()
    if ok:
        return {"success": True, "message": msg}
    raise HTTPException(status_code=500, detail=msg)


# ---------------------------------------------------------------------------
# Importación desde Tiendanube (Poblado Inverso hacia ControlCenterES)
# ---------------------------------------------------------------------------

@router.post("/import-branding")
def import_branding(_: dict = Depends(get_current_user),
                    __=Depends(require_permission("settings"))):
    """Importa el logotipo y datos oficiales de la tienda desde Tiendanube a ControlCenterES."""
    ok, msg = tn_api.import_store_branding_from_tn()
    if ok:
        return {"success": True, "message": msg}
    raise HTTPException(status_code=500, detail=msg)


@router.post("/import-catalog")
def import_catalog(background_tasks: BackgroundTasks,
                   _: dict = Depends(get_current_user),
                   __=Depends(require_permission("inventory"))):
    """Inicia la importación de productos y categorías desde Tiendanube hacia ControlCenterES."""
    tenant_id = tenancy.get_current_tenant_id()

    progress.update_progress(
        status="syncing_products",
        progress=0,
        message="Iniciando importación desde Tiendanube...",
        current=0,
        total=100
    )

    def _run_import():
        with tenancy.tenant_context(tenant_id):
            try:
                def _prog(current, total, message):
                    pct = int((current / max(1, total)) * 100)
                    progress.update_progress(
                        status="syncing_products",
                        progress=pct,
                        message=message,
                        current=current,
                        total=total
                    )

                res = tn_api.import_catalog_from_tn(progress_callback=_prog)
                progress.update_progress(
                    status="completed",
                    progress=100,
                    message=f"Importación completada: {res.get('imported', 0)} productos y {res.get('categories', 0)} categorías traídos desde Tiendanube.",
                    current=res.get("total", 0),
                    total=res.get("total", 0)
                )
            except Exception as exc:
                print(f"[Tiendanube Import Error] {exc}")
                progress.update_progress(
                    status="failed",
                    progress=0,
                    message=f"Error durante la importación: {str(exc)}"
                )

    background_tasks.add_task(_run_import)
    return {"success": True, "message": "Importación de catálogo iniciada en segundo plano."}


@router.post("/import-all")
def import_all(background_tasks: BackgroundTasks,
               _: dict = Depends(get_current_user),
               __=Depends(require_permission("settings"))):
    """Ejecuta una importación integral (Logo, Marca, Catálogo, Categorías y Pedidos)."""
    tenant_id = tenancy.get_current_tenant_id()

    progress.update_progress(
        status="syncing_products",
        progress=0,
        message="Iniciando importación total desde Tiendanube...",
        current=0,
        total=100
    )

    def _run_import_all():
        with tenancy.tenant_context(tenant_id):
            try:
                def _prog(current, total, message):
                    progress.update_progress(
                        status="syncing_products",
                        progress=current,
                        message=message,
                        current=current,
                        total=total
                    )

                res = tn_api.import_all_from_tn(progress_callback=_prog)
                progress.update_progress(
                    status="completed",
                    progress=100,
                    message=f"¡Todo importado! {res.get('products_imported', 0)} productos, {res.get('categories_imported', 0)} categorías y {res.get('orders_imported', 0)} pedidos traídos con éxito.",
                    current=100,
                    total=100
                )
            except Exception as exc:
                print(f"[Tiendanube Import All Error] {exc}")
                progress.update_progress(
                    status="failed",
                    progress=0,
                    message=f"Error en importación total: {str(exc)}"
                )

    background_tasks.add_task(_run_import_all)
    return {"success": True, "message": "Importación total iniciada en segundo plano."}


@router.delete("/disconnect")
def disconnect_tiendanube(_: dict = Depends(get_current_user),
                          __=Depends(require_permission("settings"))):
    """Desvincula la cuenta de Tiendanube del tenant activo."""
    deleted = integrations.delete_integration("tiendanube")
    return {"success": True, "message": "Integración con Tiendanube desvinculada."}
