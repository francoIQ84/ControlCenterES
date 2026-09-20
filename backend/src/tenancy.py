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
# Almacenamiento en disco
# ---------------------------------------------------------------------------

#: Raíz de los archivos subidos y generados, servida como estático en
#: /uploads (ver main.py).
UPLOADS_ROOT = "uploads"

#: Carpeta contenedora del material de los inquilinos que no son el Maestro.
TENANT_MEDIA_SUBDIR = "t"


def tenant_storage_dir(base: str, *parts, tenant_id: Optional[str] = None,
                       create: bool = True) -> str:
    """Subdirectorio de `base` que le corresponde al inquilino activo.

    El aislamiento por RLS cubre la base de datos, no el disco. Sin esto, las
    imágenes generadas por IA, los reels, las facturas, los presupuestos y el
    explorador de archivos comparten una única carpeta por tipo: cualquier
    negocio lista, descarga y borra el material de los demás. Peor todavía, los
    nombres de archivo se repiten —`presupuesto_PRES-2026-0001.pdf` es el
    primer presupuesto de CADA negocio, porque la numeración es secuencial por
    inquilino— así que uno terminaba pisando el PDF del otro.

    El Tenant Maestro se queda en `base/` a secas y no se mueve: sus rutas ya
    están escritas en products_cache, web_config y blog_posts, y sus PDF ya
    existen. Moverlas rompería el catálogo, la web y el histórico de la
    operación que hoy está andando. Los demás viven en `base/t/{tenant_id}/`.

        tenant_storage_dir("uploads", "reels")
            -> uploads/reels             (maestro)
            -> uploads/t/<uuid>/reels    (resto)
    """
    tenant_id = tenant_id or get_current_tenant_id()
    if tenant_id == MASTER_TENANT_ID:
        path = os.path.join(base, *parts)
    else:
        path = os.path.join(base, TENANT_MEDIA_SUBDIR, tenant_id, *parts)
    if create:
        os.makedirs(path, exist_ok=True)
    return path


def tenant_media_dir(*parts, tenant_id: Optional[str] = None,
                     create: bool = True) -> str:
    """`tenant_storage_dir` sobre `uploads/`, que es el caso más frecuente."""
    return tenant_storage_dir(UPLOADS_ROOT, *parts,
                              tenant_id=tenant_id, create=create)


def tenant_media_url(*parts, tenant_id: Optional[str] = None) -> str:
    """URL pública del directorio que devuelve `tenant_media_dir`."""
    rel = os.path.relpath(
        tenant_media_dir(*parts, tenant_id=tenant_id, create=False),
        UPLOADS_ROOT,
    ).replace("\\", "/")
    return "/uploads" if rel == "." else f"/uploads/{rel}"


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

#: Se apaga sola si `tenants.custom_domain` no existe (migración 016 sin
#: aplicar). Vuelve a habilitarse al invalidar la caché, que es lo que corre
#: el alta o edición de un negocio: para entonces la migración ya pasó.
_custom_domains_available = True


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
    """Limpia la caché de resolución (llamar al crear/suspender un tenant).

    Al invalidar un slug se tiran también todas las entradas de dominio: el
    dominio propio pudo haber cambiado en la misma operación y no hay forma de
    saber cuál era el anterior desde acá. Son pocas entradas y se repueblan en
    la siguiente petición.
    """
    global _custom_domains_available
    _custom_domains_available = True
    with _cache_lock:
        if slug is None:
            _cache.clear()
        else:
            _cache.pop(("slug", slug), None)
            for key in [k for k in _cache if k[0] == "domain"]:
                _cache.pop(key, None)


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


def normalize_host(host: Optional[str]) -> Optional[str]:
    """Deja el Host en una forma comparable: sin puerto, sin www, en minúsculas."""
    if not host:
        return None
    host = host.split(",")[0].strip().lower()
    if host.startswith("["):
        host = host.split("]")[0].lstrip("[")
    elif ":" in host:
        host = host.rsplit(":", 1)[0]
    if host.startswith("www."):
        host = host[4:]
    return host or None


def get_tenant_by_domain(host: Optional[str]) -> Optional[dict]:
    """Busca un tenant por su dominio propio.

    Es el segundo intento del resolver, después del subdominio. Sin esto, un
    negocio con dominio propio —que es exactamente lo que se le vende con el
    módulo "Tienda Web"— no identificaba a nadie y caía al Tenant Maestro: su
    tienda servía el catálogo de Hidroponía.

    Comparte la caché de 60s y el mismo modo tolerante que `get_tenant_by_slug`:
    si la columna todavía no existe (migración 016 sin aplicar) devuelve None y
    el llamador sigue con el comportamiento anterior.
    """
    host = normalize_host(host)
    if not host:
        return None

    # Descartar sin tocar la base lo que nunca puede ser un dominio propio.
    # Sin esto, cada petición al panel (localhost o el dominio apex) abría una
    # conexión para preguntar por un dominio que no existe, y como el error de
    # conexión no se cachea, la penalización se pagaba en TODAS.
    if host == "localhost" or host.endswith(".localhost"):
        return None
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host):
        return None
    if any(host == base or host.endswith("." + base) for base in BASE_DOMAINS):
        return None

    # Si la columna todavía no existe (migración 016 sin aplicar) se deja de
    # preguntar del todo. Sin esta bandera, desplegar el código antes que la
    # migración significaba una consulta fallida por CADA petición: el camino
    # de error no cachea nada, a propósito, porque un fallo de conexión sí debe
    # reintentarse.
    global _custom_domains_available
    if not _custom_domains_available:
        return None

    cached = _cache_get(("domain", host))
    if cached is not None:
        return cached or None

    try:
        with _system_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id::text, slug, name, status, plan_id "
                    "FROM tenants WHERE custom_domain = %s",
                    (host,),
                )
                row = cur.fetchone()
    except psycopg2.errors.UndefinedColumn:
        _custom_domains_available = False
        print("[Tenancy] tenants.custom_domain no existe todavía: se omite la "
              "resolución por dominio propio hasta aplicar la migración 016.")
        return None
    except psycopg2.Error:
        return None

    tenant = dict(row) if row else None
    _cache_put(("domain", host), tenant or False)
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


def invalidate_limits_cache(tenant_id: Optional[str] = None):
    """Limpia la caché de límites (llamar al cambiar de plan)."""
    with _cache_lock:
        if tenant_id is None:
            for key in [k for k in _cache if k[0] == "limits"]:
                _cache.pop(key, None)
        else:
            _cache.pop(("limits", tenant_id), None)


def get_plan_limits(tenant_id: Optional[str] = None) -> dict:
    """Topes del plan contratado (`tenant_settings.plan_limits`).

    Un diccionario `{"products": 150, "users": 3}`. La ausencia de una clave
    significa "sin tope", igual que un valor nulo o <= 0: los planes se venden
    con límites pero hasta ahora no había nada que los leyera, así que el
    criterio por defecto tiene que ser no romper nada.
    """
    tenant_id = tenant_id or get_current_tenant_id()
    cached = _cache_get(("limits", tenant_id))
    if cached is not None:
        return cached

    limits = {}
    try:
        with _system_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SET app.current_tenant = %s", (tenant_id,))
                cur.execute(
                    "SELECT plan_limits FROM tenant_settings WHERE tenant_id = %s",
                    (tenant_id,),
                )
                row = cur.fetchone()
        if row and row["plan_limits"]:
            limits = dict(row["plan_limits"])
    except psycopg2.Error:
        return {}

    _cache_put(("limits", tenant_id), limits)
    return limits


def get_plan_limit(resource: str, tenant_id: Optional[str] = None) -> Optional[int]:
    """Tope de un recurso, o None si no tiene.

    El Tenant Maestro nunca tiene tope: es la operación propia, no un cliente
    con un plan contratado.
    """
    tenant_id = tenant_id or get_current_tenant_id()
    if tenant_id == MASTER_TENANT_ID:
        return None
    value = get_plan_limits(tenant_id).get(resource)
    try:
        value = int(value)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def is_module_active(module: str, tenant_id: Optional[str] = None) -> bool:
    """True si el tenant tiene el módulo contratado.

    Mientras `tenant_settings` no esté poblado devuelve True, para no apagar
    funcionalidad que hoy está en uso.
    """
    if module == "quotes":
        return is_module_active("sales", tenant_id)
    modules = get_active_modules(tenant_id)
    return module in modules if modules else True
