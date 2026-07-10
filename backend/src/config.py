from src.database import get_setting, set_setting, delete_setting

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

def get_client_id():
    return get_setting('meli_client_id', '')

def set_client_id(val):
    set_setting('meli_client_id', val)

def get_client_secret():
    return get_setting('meli_client_secret', '')

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
