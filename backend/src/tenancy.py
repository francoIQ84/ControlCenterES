"""
Capa de Multi-Tenancy de ControlCenter.

Este módulo es deliberadamente delgado y NO importa `src.database`: la
resolución del tenant tiene que ocurrir *antes* de que exista un tenant, así
que abre sus propias conexiones de sistema. Eso además evita el import
circular (database -> tenancy -> database).

Cómo encaja con el código existente
-----------------------------------
La aplicación no usa ORM: son ~242 sentencias SQL escritas a mano. Filtrarlas
una por una sería reescribir el sistema y garantizaría fugas por olvido. En
lugar de eso, el aislamiento vive en la base:

    1. El middleware resuelve el tenant del subdominio y lo deja en un
       ContextVar (el equivalente Python de AsyncLocalStorage).
    2. `database.get_connection()` emite `SET app.current_tenant` al abrir
       cada conexión.
    3. Las políticas RLS de PostgreSQL filtran TODAS las consultas contra esa
       variable, sin que las consultas se enteren.

Resultado: el SQL existente queda intacto y no hay forma de "olvidarse" el
filtro, porque no lo aplica el código sino el motor.
"""

import os
import re
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

#: Tenant Maestro: la operación original de hidroponía en Rosario.
#: Debe coincidir exactamente con el UUID sembrado en 001_multitenancy.sql.
MASTER_TENANT_ID = "00000000-0000-0000-0000-000000000001"
MASTER_TENANT_SLUG = "hidroponia"

#: Subdominios que nunca son un tenant.
RESERVED_SLUGS = frozenset({
    "www", "api", "admin", "app", "static", "cdn", "assets", "mail",
    "smtp", "ftp", "blog", "docs", "status", "panel", "dashboard",
})

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
                      r"[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

#: Dominios base bajo los cuales `{slug}.dominio` identifica a un tenant.
#: Configurable para no hardcodear el dominio de producción.
BASE_DOMAINS = tuple(
    d.strip().lower()
    for d in os.environ.get("TENANT_BASE_DOMAINS", "controlcenter.app").split(",")
    if d.strip()
)

_CACHE_TTL_SECONDS = 60


# ---------------------------------------------------------------------------
# Contexto de la petición
# ---------------------------------------------------------------------------

_current_tenant_id: ContextVar[str] = ContextVar(
    "controlcenter_current_tenant_id", default=MASTER_TENANT_ID
)
_current_tenant: ContextVar[Optional[dict]] = ContextVar(
    "controlcenter_current_tenant", default=None
)


def get_current_tenant_id() -> str:
    """UUID del tenant activo. Cae al Tenant Maestro fuera de una petición."""
    return _current_tenant_id.get()


def get_current_tenant() -> Optional[dict]:
    """Fila completa del tenant activo, si el resolver la cargó."""
    return _current_tenant.get()


def set_current_tenant(tenant_id: str, tenant: Optional[dict] = None):
    """Fija el tenant activo. Devuelve los tokens para restaurarlo después."""
    if not is_valid_tenant_id(tenant_id):
        raise ValueError(f"tenant_id inválido: {tenant_id!r}")
    return _current_tenant_id.set(tenant_id), _current_tenant.set(tenant)


def reset_current_tenant(tokens):
    token_id, token_obj = tokens
    _current_tenant_id.reset(token_id)
    _current_tenant.reset(token_obj)


@contextmanager
def tenant_context(tenant_id: str, tenant: Optional[dict] = None):
    """Ejecuta un bloque bajo un tenant explícito.

    Imprescindible para todo lo que corre fuera del ciclo request/response
    (scheduler, webhooks de Mercado Libre, tareas de mantenimiento), donde no
    hay subdominio del cual deducir el inquilino::

        for t in list_active_tenants():
            with tenant_context(t['id']):
                sync_mercadolibre()
    """
    tokens = set_current_tenant(tenant_id, tenant)
    try:
        yield tenant_id
    finally:
        reset_current_tenant(tokens)


def is_valid_tenant_id(value) -> bool:
    return bool(value and isinstance(value, str) and _UUID_RE.match(value))


# ---------------------------------------------------------------------------
# Resolución por subdominio
# ---------------------------------------------------------------------------

def extract_slug_from_host(host: Optional[str]) -> Optional[str]:
    """Deriva el slug del tenant a partir del Host HTTP.

    Devuelve None cuando el host no identifica a ningún tenant (localhost, una
    IP desnuda, el dominio apex o un subdominio reservado); en ese caso el
    llamador debe usar el Tenant Maestro, que es lo que mantiene funcionando
    la operación actual sin cambiar nada de infraestructura.

    >>> extract_slug_from_host("acme.controlcenter.app")
    'acme'
    >>> extract_slug_from_host("controlcenter.app") is None
    True
    >>> extract_slug_from_host("localhost:5173") is None
    True
    """
    if not host:
        return None

    host = host.split(",")[0].strip().lower()
    # Descartar el puerto (cuidando IPv6 entre corchetes)
    if host.startswith("["):
        host = host.split("]")[0].lstrip("[")
    elif ":" in host:
        host = host.rsplit(":", 1)[0]

    if not host or host == "localhost" or host.endswith(".localhost"):
        return None
    # IPv4 desnuda
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host):
        return None

    for base in BASE_DOMAINS:
        if host == base or not host.endswith("." + base):
            continue
        slug = host[: -(len(base) + 1)]
        if "." in slug:                      # sub-sub-dominio: no soportado
            return None
        if slug in RESERVED_SLUGS or not _SLUG_RE.match(slug):
            return None
        return slug

    return None


# ---------------------------------------------------------------------------
# Registro de tenants
# ---------------------------------------------------------------------------

def _system_connection():
    """Conexión sin contexto de tenant, para consultar el registro.

    `tenants` es la única tabla sin RLS justamente porque hay que leerla antes
    de saber quién es el inquilino.
    """
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/controlcenter",
    )
    conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    conn.autocommit = True
    return conn


_cache = {}
_cache_lock = threading.Lock()


def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and entry[0] > time.time():
            return entry[1]
        if entry:
            _cache.pop(key, None)
    return None


def _cache_put(key, value):
    with _cache_lock:
        _cache[key] = (time.time() + _CACHE_TTL_SECONDS, value)


def invalidate_tenant_cache(slug: Optional[str] = None):
    """Limpia la caché de resolución (llamar al crear/suspender un tenant)."""
    with _cache_lock:
        if slug is None:
            _cache.clear()
        else:
            _cache.pop(("slug", slug), None)


def invalidate_module_cache(tenant_id: Optional[str] = None):
    """Limpia la caché de módulos contratados (llamar al cambiar de plan)."""
    with _cache_lock:
        if tenant_id is None:
            for key in [k for k in _cache if k[0] == "modules"]:
                _cache.pop(key, None)
        else:
            _cache.pop(("modules", tenant_id), None)


def get_tenant_by_slug(slug: str) -> Optional[dict]:
    """Busca un tenant por slug, con caché de 60s para no pegarle a la DB
    en cada request."""
    if not slug:
        return None

    cached = _cache_get(("slug", slug))
    if cached is not None:
        return cached or None

    try:
        with _system_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id::text, slug, name, status, plan_id "
                    "FROM tenants WHERE slug = %s",
                    (slug,),
                )
                row = cur.fetchone()
    except psycopg2.Error:
        # La tabla puede no existir todavía (migración sin aplicar). No es
        # motivo para tirar abajo la petición: se cae al Tenant Maestro.
        return None

    tenant = dict(row) if row else None
    _cache_put(("slug", slug), tenant or False)
    return tenant


def get_master_tenant() -> dict:
    tenant = get_tenant_by_slug(MASTER_TENANT_SLUG)
    if tenant:
        return tenant
    # Fallback duro: si la migración todavía no corrió, el sistema tiene que
    # seguir operando exactamente como antes.
    return {
        "id": MASTER_TENANT_ID,
        "slug": MASTER_TENANT_SLUG,
        "name": "Hidroponía Rosario",
        "status": "active",
        "plan_id": "master",
    }


def list_active_tenants() -> list:
    """Tenants activos. Punto de entrada para los jobs del scheduler."""
    try:
        with _system_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id::text, slug, name, status, plan_id FROM tenants "
                    "WHERE status IN ('active', 'trial') ORDER BY created_at"
                )
                return [dict(r) for r in cur.fetchall()]
    except psycopg2.Error:
        return [get_master_tenant()]


# ---------------------------------------------------------------------------
# Modularidad por plan
# ---------------------------------------------------------------------------

def get_active_modules(tenant_id: Optional[str] = None) -> list:
    """Módulos contratados por el tenant (tenant_settings.active_modules)."""
    tenant_id = tenant_id or get_current_tenant_id()
    cached = _cache_get(("modules", tenant_id))
    if cached is not None:
        return cached

    try:
        with _system_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SET app.current_tenant = %s", (tenant_id,))
                cur.execute(
                    "SELECT active_modules FROM tenant_settings WHERE tenant_id = %s",
                    (tenant_id,),
                )
                row = cur.fetchone()
    except psycopg2.Error:
        return []

    modules = list(row["active_modules"]) if row and row["active_modules"] else []
    _cache_put(("modules", tenant_id), modules)
    return modules


def is_module_active(module: str, tenant_id: Optional[str] = None) -> bool:
    """True si el tenant tiene el módulo contratado.

    Mientras `tenant_settings` no esté poblado devuelve True, para no apagar
    funcionalidad que hoy está en uso.
    """
    modules = get_active_modules(tenant_id)
    return module in modules if modules else True
