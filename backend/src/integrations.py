"""
Credenciales de integraciones externas, por tenant y cifradas en reposo.

Reemplaza al patrón actual de guardar tokens en la tabla `settings` en texto
plano. Las lecturas y escrituras pasan por `database.get_connection()`, así que
RLS ya garantiza que un tenant no toque las credenciales de otro; el cifrado
AES-256 es la segunda capa, para que un volcado de la base tampoco las revele.

Convivencia con lo existente
----------------------------
`get_credentials()` cae a la tabla `settings` cuando el tenant todavía no migró
sus credenciales. Eso permite mover integraciones de a una, sin un corte, y que
la operación de Hidroponía siga andando con su configuración de siempre.
"""

from typing import Optional

from src import database, tenancy
from src.utils import crypto

#: Proveedores admitidos. Debe coincidir con el CHECK de tenant_integrations.
PROVIDERS = ("mercadolibre", "mercadopago", "afip", "meta", "google", "whatsapp", "tiendanube")

#: Claves de la tabla `settings` que cubre cada proveedor, para la lectura
#: de compatibilidad mientras dure la migración.
LEGACY_SETTING_KEYS = {
    "mercadolibre": {
        "client_id": "meli_client_id",
        "client_secret": "meli_client_secret",
        "access_token": "meli_access_token",
        "refresh_token": "meli_refresh_token",
        "user_id": "meli_user_id",
    },
    "mercadopago": {
        "access_token": "mp_access_token",
        "public_key": "mp_public_key",
    },
    "google": {
        "api_key": "gemini_api_key",
    },
    "tiendanube": {
        "client_id": "tn_client_id",
        "client_secret": "tn_client_secret",
        "access_token": "tn_access_token",
        "store_id": "tn_store_id",
        "user_id": "tn_user_id",
    },
}


class UnknownProvider(ValueError):
    pass


def _check_provider(provider: str) -> str:
    provider = (provider or "").strip().lower()
    if provider not in PROVIDERS:
        raise UnknownProvider(
            f"Proveedor '{provider}' no admitido. Válidos: {', '.join(PROVIDERS)}")
    return provider


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------

def save_credentials(provider: str, credentials: dict,
                     external_account_id: Optional[str] = None,
                     is_active: Optional[bool] = None) -> dict:
    """Cifra y guarda las credenciales del proveedor para el tenant activo."""
    provider = _check_provider(provider)
    tenant_id = tenancy.get_current_tenant_id()

    if not isinstance(credentials, dict):
        raise ValueError("Las credenciales deben ser un diccionario")

    blob = crypto.encrypt_json(credentials, tenant_id)
    active = bool(credentials) if is_active is None else bool(is_active)

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO tenant_integrations
                    (tenant_id, provider, credentials_encrypted,
                     external_account_id, is_active, updated_at)
                VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (tenant_id, provider) DO UPDATE SET
                    credentials_encrypted = EXCLUDED.credentials_encrypted,
                    external_account_id   = COALESCE(EXCLUDED.external_account_id,
                                                     tenant_integrations.external_account_id),
                    is_active             = EXCLUDED.is_active,
                    updated_at            = CURRENT_TIMESTAMP
                RETURNING id, provider, external_account_id, is_active
            """, (tenant_id, provider, blob, external_account_id, active))
            return dict(cursor.fetchone())


def set_active(provider: str, is_active: bool):
    provider = _check_provider(provider)
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE tenant_integrations SET is_active = %s, "
                "updated_at = CURRENT_TIMESTAMP WHERE provider = %s",
                (bool(is_active), provider))
            return cursor.rowcount > 0


def touch_last_sync(provider: str):
    provider = _check_provider(provider)
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE tenant_integrations SET last_sync_at = CURRENT_TIMESTAMP "
                "WHERE provider = %s", (provider,))


def delete_integration(provider: str) -> bool:
    provider = _check_provider(provider)
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM tenant_integrations WHERE provider = %s",
                           (provider,))
            return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Lectura
# ---------------------------------------------------------------------------

def get_credentials(provider: str, allow_legacy: bool = True) -> Optional[dict]:
    """Credenciales descifradas del proveedor, o None si no hay.

    Si el tenant todavía no las migró a `tenant_integrations`, las reconstruye
    desde la tabla `settings` para no romper la operación en curso.
    """
    provider = _check_provider(provider)
    tenant_id = tenancy.get_current_tenant_id()

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT credentials_encrypted FROM tenant_integrations "
                "WHERE provider = %s", (provider,))
            row = cursor.fetchone()

    if row and row["credentials_encrypted"]:
        return crypto.decrypt_json(row["credentials_encrypted"], tenant_id)

    if allow_legacy:
        return _get_legacy_credentials(provider)
    return None


def _get_legacy_credentials(provider: str) -> Optional[dict]:
    """Arma las credenciales desde la tabla `settings` (pre multi-tenancy).

    La lectura ya está acotada al tenant por RLS, porque `settings` también
    lleva tenant_id.
    """
    mapping = LEGACY_SETTING_KEYS.get(provider)
    if not mapping:
        return None

    creds = {}
    for field, setting_key in mapping.items():
        value = database.get_setting(setting_key, "")
        if value:
            creds[field] = value
    return creds or None


def list_integrations() -> list:
    """Estado de las integraciones del tenant. Nunca devuelve secretos."""
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT provider, external_account_id, is_active,
                       last_sync_at, updated_at,
                       (credentials_encrypted IS NOT NULL) AS has_credentials
                FROM tenant_integrations
                ORDER BY provider
            """)
            stored = {r["provider"]: dict(r) for r in cursor.fetchall()}

    result = []
    for provider in PROVIDERS:
        entry = stored.get(provider)
        if entry:
            result.append(entry)
        else:
            legacy = _get_legacy_credentials(provider)
            result.append({
                "provider": provider,
                "external_account_id": None,
                "is_active": False,
                "last_sync_at": None,
                "updated_at": None,
                "has_credentials": bool(legacy),
                "legacy": bool(legacy),
            })
    return result


def migrate_legacy_credentials(provider: str) -> bool:
    """Mueve las credenciales de `settings` a `tenant_integrations` cifradas.

    Deja las claves originales en `settings` a propósito: si algo sale mal, la
    integración sigue funcionando por el camino de compatibilidad. Limpiarlas
    es un paso posterior y deliberado.
    """
    provider = _check_provider(provider)
    legacy = _get_legacy_credentials(provider)
    if not legacy:
        return False

    account_id = legacy.get("user_id") or legacy.get("account_id")
    save_credentials(provider, legacy, external_account_id=account_id,
                     is_active=True)
    return True


# ---------------------------------------------------------------------------
# Resolución de webhooks
# ---------------------------------------------------------------------------

def resolve_tenant_by_account(provider: str, account_id) -> Optional[str]:
    """Averigua a qué tenant pertenece una cuenta externa.

    Lo usan los webhooks entrantes (una venta de Mercado Libre llega con un
    ml_user_id y sin subdominio). Se apoya en la función SECURITY DEFINER
    `app_resolve_tenant_by_account`, que es lo único autorizado a mirar filas
    de todos los tenants, y solo devuelve un UUID.
    """
    provider = _check_provider(provider)
    if account_id in (None, ""):
        return None

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT app_resolve_tenant_by_account(%s, %s) AS tenant_id",
                (provider, str(account_id)))
            row = cursor.fetchone()
    return row["tenant_id"] if row and row["tenant_id"] else None
