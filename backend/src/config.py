from src.database import get_setting, set_setting, delete_setting
import os

# Default configuration values
DEFAULT_REDIRECT_URI = "http://localhost:8088/meli_callback"
DEFAULT_COUNTRY = "AR"

# Country configuration dictionary for Mercado Libre endpoints
COUNTRIES = {
    'AR': {'name': 'Argentina', 'auth_url': 'https://auth.mercadolibre.com.ar', 'site_id': 'MLA'},
    'BR': {'name': 'Brasil', 'auth_url': 'https://auth.mercadolibre.com.br', 'site_id': 'MLB'},
    'MX': {'name': 'México', 'auth_url': 'https://auth.mercadolibre.com.mx', 'site_id': 'MLM'},
    'CO': {'name': 'Colombia', 'auth_url': 'https://auth.mercadolibre.com.co', 'site_id': 'MCO'},
    'CL': {'name': 'Chile', 'auth_url': 'https://auth.mercadolibre.com.cl', 'site_id': 'MLC'},
    'UY': {'name': 'Uruguay', 'auth_url': 'https://auth.mercadolibre.com.uy', 'site_id': 'MLU'},
    'PE': {'name': 'Perú', 'auth_url': 'https://auth.mercadolibre.com.pe', 'site_id': 'MPE'},
}

def _tenant_first(setting_key: str, env_var: str) -> str:
    """Valor propio del inquilino, con la credencial de plataforma de respaldo.

    El orden importa y antes estaba al revés: se leía la variable de entorno
    primero, así que con `MELI_CLIENT_ID` definida en el `.env` del servidor
    TODOS los negocios quedaban usando la aplicación de Mercado Libre del
    desarrollador, y el App ID que cada uno cargaba en Configuración se
    ignoraba en silencio —sin error, sin aviso—.

    Ahora manda lo que el negocio configuró. Si no configuró nada, recién ahí
    se usa la credencial global: primero la del Tenant Maestro (que es donde
    las guarda el panel de plataforma) y por último la variable de entorno.
    Así la app compartida sigue siendo un default útil sin pisar a quien
    registró la suya.
    """
    own = get_setting(setting_key, '')
    if own:
        return own

    from src import tenancy
    if tenancy.get_current_tenant_id() != tenancy.MASTER_TENANT_ID:
        try:
            with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
                shared = get_setting(setting_key, '')
            if shared:
                return shared
        except Exception:
            pass

    return os.getenv(env_var) or ''


def get_client_id():
    return _tenant_first('meli_client_id', 'MELI_CLIENT_ID')

def set_client_id(val):
    set_setting('meli_client_id', val)

def get_client_secret():
    return _tenant_first('meli_client_secret', 'MELI_CLIENT_SECRET')

def set_client_secret(val):
    set_setting('meli_client_secret', val)

def get_redirect_uri():
    return get_setting('meli_redirect_uri', DEFAULT_REDIRECT_URI)

def set_redirect_uri(val):
    set_setting('meli_redirect_uri', val)

def get_country():
    return get_setting('country', DEFAULT_COUNTRY)

def set_country(val):
    set_setting('country', val)

def get_access_token():
    return get_setting('meli_access_token', '')

def set_access_token(val):
    set_setting('meli_access_token', val)

def get_refresh_token():
    return get_setting('meli_refresh_token', '')

def set_refresh_token(val):
    set_setting('meli_refresh_token', val)

def get_token_expiry():
    val = get_setting('meli_token_expiry', '0')
    try:
        return float(val)
    except ValueError:
        return 0.0

def set_token_expiry(val):
    set_setting('meli_token_expiry', str(val))

def get_user_id():
    return get_setting('meli_user_id', '')

def set_user_id(val):
    set_setting('meli_user_id', val)

def is_configured():
    """Checks if the basic API keys are set."""
    return bool(get_client_id() and get_client_secret())

def is_authenticated():
    """Checks if the user has an access token."""
    return bool(get_access_token())
