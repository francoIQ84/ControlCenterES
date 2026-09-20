"""
Cliente del puente de WhatsApp (el servicio Node/Baileys).

Existe por dos motivos.

El primero es que `http://127.0.0.1:8091` estaba escrito a mano en siete
lugares distintos —scheduler, difusión, gastos, clientes, alta de negocios y el
propio módulo de WhatsApp—, así que cambiar de puerto o de host obligaba a
buscarlos todos.

El segundo es de aislamiento: el puente no tiene forma de saber de qué negocio
es el mensaje que se le pide enviar. Cada llamada sale ahora con
`X-Tenant-Slug`, que es el mismo canal por el que el puente identifica al
inquilino cuando nos avisa a nosotros (ver `whatsapp.resolve_bridge_tenant`).
Mientras haya un único puente el header es informativo; el día que haya una
instancia por negocio, el ruteo ya está expresado.
"""

import os
from typing import Optional

import requests

from src import tenancy

#: Configurable para no quedar atados al puerto por defecto.
BASE_URL = os.environ.get("WHATSAPP_BRIDGE_URL", "http://127.0.0.1:8091").rstrip("/")

DEFAULT_TIMEOUT = 10


def _headers() -> dict:
    """Identifica al inquilino de la petición saliente.

    Se manda el slug y no el UUID porque es lo que el puente puede mapear a una
    sesión por configuración, sin conocer el esquema de la base.
    """
    tenant = tenancy.get_current_tenant()
    slug = (tenant or {}).get("slug")
    if not slug:
        # Fuera de una petición HTTP (scheduler) el resolver no cargó la fila
        # completa: se traduce el id a slug con la caché de tenancy.
        slug = _slug_for(tenancy.get_current_tenant_id())
    return {"X-Tenant-Slug": slug} if slug else {}


def _slug_for(tenant_id: str) -> Optional[str]:
    if tenant_id == tenancy.MASTER_TENANT_ID:
        return tenancy.MASTER_TENANT_SLUG
    for t in tenancy.list_active_tenants():
        if t.get("id") == tenant_id:
            return t.get("slug")
    return None


def post(path: str, json_body: dict, timeout: int = DEFAULT_TIMEOUT):
    return requests.post(f"{BASE_URL}/{path.lstrip('/')}",
                         json=json_body, headers=_headers(), timeout=timeout)


def get(path: str, timeout: int = DEFAULT_TIMEOUT):
    return requests.get(f"{BASE_URL}/{path.lstrip('/')}",
                        headers=_headers(), timeout=timeout)


def send_broadcast(recipients: list, message: str, delay_seconds: int = 1,
                   timeout: int = DEFAULT_TIMEOUT):
    """Envía un mensaje a una lista de destinatarios del inquilino activo."""
    return post("send-broadcast", {
        "recipients": recipients,
        "message": message,
        "delaySeconds": delay_seconds,
    }, timeout=timeout)
