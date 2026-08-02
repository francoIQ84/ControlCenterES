"""
Cifrado en reposo de credenciales de integraciones (AES-256-GCM).

Todo secreto de un tenant — tokens de Mercado Libre, clave privada de AFIP,
API keys de Meta o Gemini — se guarda cifrado en
`tenant_integrations.credentials_encrypted`.

Se usa GCM y no CBC porque además de confidencialidad da autenticación: si
alguien altera un ciphertext en la base, el descifrado falla en vez de devolver
basura silenciosamente. El `tenant_id` viaja como Additional Authenticated
Data, de modo que un blob copiado de la fila de un tenant a la de otro no
descifra.

Formato del texto cifrado::

    v1:<base64url(nonce[12] || ciphertext || tag[16])>

El prefijo de versión existe para poder rotar el algoritmo más adelante sin
tener que adivinar cómo se cifró cada fila.

Generar la clave maestra (una sola vez, guardarla fuera del repositorio)::

    python -m src.utils.crypto --generate-key
"""

import base64
import json
import os
import secrets
from typing import Optional

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_VERSION = "v1"
_NONCE_BYTES = 12
_KEY_BYTES = 32  # AES-256

ENV_KEY_NAME = "CREDENTIALS_ENCRYPTION_KEY"


class EncryptionKeyMissing(RuntimeError):
    """La clave maestra no está configurada."""


class DecryptionFailed(RuntimeError):
    """El ciphertext fue alterado, o corresponde a otra clave u otro tenant."""


def generate_key() -> str:
    """Devuelve una clave maestra nueva, lista para CREDENTIALS_ENCRYPTION_KEY."""
    return base64.urlsafe_b64encode(secrets.token_bytes(_KEY_BYTES)).decode("ascii")


def _load_key() -> bytes:
    raw = os.environ.get(ENV_KEY_NAME, "").strip()
    if not raw:
        raise EncryptionKeyMissing(
            f"Falta {ENV_KEY_NAME}. Generá una con "
            f"`python -m src.utils.crypto --generate-key` y cargala como "
            f"variable de entorno (no la pongas en un archivo versionado)."
        )
    try:
        key = base64.urlsafe_b64decode(raw)
    except Exception as exc:
        raise EncryptionKeyMissing(f"{ENV_KEY_NAME} no es base64 válido: {exc}") from exc

    if len(key) != _KEY_BYTES:
        raise EncryptionKeyMissing(
            f"{ENV_KEY_NAME} debe decodificar a {_KEY_BYTES} bytes "
            f"(AES-256); decodificó a {len(key)}."
        )
    return key


def is_configured() -> bool:
    """True si hay una clave maestra utilizable. No lanza excepción."""
    try:
        _load_key()
        return True
    except EncryptionKeyMissing:
        return False


def encrypt(plaintext: str, tenant_id: Optional[str] = None) -> str:
    """Cifra una cadena. `tenant_id` queda ligado criptográficamente al
    resultado: el blob no descifra bajo otro tenant."""
    if plaintext is None:
        raise ValueError("No hay nada que cifrar")

    aesgcm = AESGCM(_load_key())
    nonce = secrets.token_bytes(_NONCE_BYTES)
    aad = (tenant_id or "").encode("utf-8")
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
    return f"{_VERSION}:" + base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt(token: str, tenant_id: Optional[str] = None) -> str:
    """Descifra lo producido por `encrypt`, con el mismo `tenant_id`."""
    if not token:
        raise DecryptionFailed("Ciphertext vacío")

    version, _, payload = token.partition(":")
    if version != _VERSION or not payload:
        raise DecryptionFailed(f"Formato desconocido: {token[:16]!r}")

    try:
        blob = base64.urlsafe_b64decode(payload)
    except Exception as exc:
        raise DecryptionFailed(f"Payload base64 inválido: {exc}") from exc

    if len(blob) <= _NONCE_BYTES:
        raise DecryptionFailed("Ciphertext demasiado corto")

    aesgcm = AESGCM(_load_key())
    aad = (tenant_id or "").encode("utf-8")
    try:
        plain = aesgcm.decrypt(blob[:_NONCE_BYTES], blob[_NONCE_BYTES:], aad)
    except InvalidTag as exc:
        raise DecryptionFailed(
            "No se pudo descifrar: el dato fue alterado, la clave maestra "
            "cambió, o el blob pertenece a otro tenant."
        ) from exc
    return plain.decode("utf-8")


def encrypt_json(data: dict, tenant_id: Optional[str] = None) -> str:
    return encrypt(json.dumps(data, separators=(",", ":")), tenant_id)


def decrypt_json(token: str, tenant_id: Optional[str] = None) -> dict:
    return json.loads(decrypt(token, tenant_id))


def mask(value: Optional[str], keep: int = 4) -> str:
    """Representación segura para mostrar en la UI o loguear: `••••3f9a`."""
    if not value:
        return ""
    if len(value) <= keep:
        return "•" * len(value)
    return "•" * 8 + value[-keep:]


if __name__ == "__main__":
    import sys

    if "--generate-key" in sys.argv:
        print()
        print("  Clave maestra AES-256 nueva:\n")
        print(f"    {ENV_KEY_NAME}={generate_key()}")
        print()
        print("  Guardala como variable de entorno del servicio.")
        print("  NO la pongas en backend/.env: ese archivo está versionado en git.")
        print()
        print("  Si la perdés, las credenciales cifradas de todos los tenants")
        print("  son irrecuperables y hay que volver a cargarlas a mano.")
        print()
    else:
        print(__doc__)
