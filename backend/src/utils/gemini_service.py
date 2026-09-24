"""
Servicio centralizado para la integración con Google Gemini AI.

Proporciona:
- Auto-descubrimiento dinámico de modelos disponibles para la API Key configurada.
- Lista de modelos de respaldo modernos (Gemini 3.8 Flash, 3.5 Flash, 2.5 Flash, etc.)
  reemplazando modelos discontinuados (Gemini 2.0 Flash cerrado el 1 de junio de 2026,
  gemini-3.6-flash inexistente, etc.).
- Reintentos ordenados con fallback automático ante errores 404 / 429 / 503.
- Extracción clara de errores de la API de Google.
"""

import json
import re
import time
import urllib.request
import urllib.error
from typing import List, Tuple, Optional

# Modelos recomendados y vigentes de Google Gemini (ordenados por preferencia: Flash rápidos y modernos primero)
FALLBACK_GEMINI_MODELS: List[str] = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
]

# Modelos para generación y edición de imágenes con Gemini
GEMINI_IMAGE_MODELS: List[str] = [
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
]

# Caché en memoria para modelos descubiertos: {key_hash: (timestamp, [model_names])}
_MODELS_CACHE: dict = {}
CACHE_TTL_SECONDS = 3600  # 1 hora


def _get_model_priority(model_name: str) -> int:
    """Devuelve un score de prioridad (menor es mejor / se prueba antes)."""
    name = model_name.lower()
    # Flash models are fastest and cost-effective
    if "3.8-flash" in name:
        return 10
    if "3.5-flash" in name and "lite" not in name:
        return 20
    if "3.5-flash-lite" in name:
        return 25
    if "2.5-flash" in name and "lite" not in name:
        return 30
    if "2.5-flash-lite" in name:
        return 35
    if "1.5-flash" in name:
        return 40
    # Pro models
    if "3.8" in name or "3.5" in name:
        return 50
    if "2.5-pro" in name:
        return 60
    if "1.5-pro" in name:
        return 70
    if "flash" in name:
        return 80
    return 100


def get_available_gemini_models(gemini_key: str = "") -> List[str]:
    """
    Obtiene la lista de modelos de texto/chat compatibles disponibles para la API Key dada.
    Consulta el endpoint `v1beta/models` de Google y cachea por 1 hora.
    Si la consulta remota falla, retorna la lista de respaldo moderna.
    """
    if not gemini_key or not gemini_key.strip():
        return list(FALLBACK_GEMINI_MODELS)

    clean_key = gemini_key.strip()
    cache_key = clean_key[:12] + clean_key[-6:] if len(clean_key) > 18 else clean_key

    now = time.time()
    if cache_key in _MODELS_CACHE:
        cached_time, cached_models = _MODELS_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS and cached_models:
            return list(cached_models)

    discovered: List[str] = []
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={clean_key}"
        req = urllib.request.Request(url, headers={"User-Agent": "ControlCenter/2.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for m in data.get("models", []):
                name = m.get("name", "")
                if name.startswith("models/"):
                    name = name[7:]
                methods = m.get("supportedGenerationMethods", [])
                
                # Filtrar solo modelos que soporten generateContent y sean de la familia gemini
                if "gemini" in name.lower() and "generateContent" in methods:
                    # Descartar modelos exclusivos de embedding o imágenes puras
                    if "embedding" not in name.lower() and not name.endswith("-image"):
                        discovered.append(name)

        if discovered:
            # Ordenar por prioridad
            discovered.sort(key=_get_model_priority)
    except Exception as e:
        # Falla silenciosa de auto-descubrimiento (timeout, red, etc.) -> usamos lista fija
        pass

    # Combinar modelos descubiertos con la lista fija de respaldo (evitando duplicados)
    result = list(discovered)
    for fm in FALLBACK_GEMINI_MODELS:
        if fm not in result:
            result.append(fm)

    if result:
        _MODELS_CACHE[cache_key] = (now, result)

    return result


def extract_gemini_error(exc: Exception) -> str:
    """Extrae un mensaje de error limpio y comprensible de una excepción HTTP o genérica."""
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode("utf-8", errors="ignore")
            err_json = json.loads(body)
            msg = err_json.get("error", {}).get("message")
            if msg:
                return f"Google Gemini ({exc.code}): {msg}"
        except Exception:
            pass
        if exc.code == 404:
            return f"HTTP 404: Modelo de Gemini no encontrado o discontinuado en esta versión de API."
        if exc.code == 400:
            return f"HTTP 400: Solicitud rechazada por Gemini (posible API Key inválida o parámetro incorrecto)."
        if exc.code == 429:
            return f"HTTP 429: Cuota o límite de peticiones de Gemini excedido."
        return f"HTTP {exc.code}: {exc.reason}"
    return str(exc)


def generate_gemini_content(
    prompt: str,
    gemini_key: str,
    response_json: bool = False,
    temperature: float = 0.4,
    max_tokens: int = 4096,
    timeout: int = 25,
    system_instruction: Optional[str] = None
) -> Tuple[str, str]:
    """
    Envía un prompt a Gemini iterando automáticamente sobre los modelos disponibles.
    Retorna (texto_respuesta, modelo_usado).
    Lanza Exception con el último error detallado si todos los modelos fallan.
    """
    if not gemini_key or not gemini_key.strip():
        raise Exception("Se requiere una API Key de Gemini configurada en Ajustes.")

    models_to_try = get_available_gemini_models(gemini_key)
    last_err = ""

    payload: dict = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
    }

    if response_json:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key.strip()}"
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                candidates = res_data.get("candidates", [])
                if not candidates:
                    continue
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts:
                    continue
                text = parts[0].get("text", "").strip()
                if text:
                    return text, model_name
        except urllib.error.HTTPError as e:
            # Si falló con 400 por responseMimeType, intentar sin responseMimeType
            if e.code == 400 and response_json:
                try:
                    p2 = dict(payload)
                    p2["generationConfig"] = {"temperature": temperature, "maxOutputTokens": max_tokens}
                    req2 = urllib.request.Request(
                        url,
                        data=json.dumps(p2).encode("utf-8"),
                        headers={"Content-Type": "application/json"}
                    )
                    with urllib.request.urlopen(req2, timeout=timeout) as resp2:
                        res2 = json.loads(resp2.read().decode("utf-8"))
                        cands = res2.get("candidates", [])
                        if cands and cands[0].get("content", {}).get("parts"):
                            t2 = cands[0]["content"]["parts"][0].get("text", "").strip()
                            if t2:
                                return t2, model_name
                except Exception:
                    pass
            last_err = extract_gemini_error(e)
            continue
        except Exception as e:
            last_err = extract_gemini_error(e)
            continue

    raise Exception(f"No se pudo generar contenido con Gemini IA: {last_err}")
