"""Auditoría de calidad de publicaciones de Mercado Libre.

Este módulo es de SOLO LECTURA: nunca modifica una publicación. Trae el
diagnóstico que ya calcula Mercado Libre y lo cachea para poder ordenar el
inventario por calidad y, más adelante, decirle a la IA qué objetivo puntual
tiene que cubrir.

Mercado Libre discontinuó /items/{id}/health y lo reemplazó por
/item/{id}/performance, que consolida puntaje y objetivos en una sola llamada.
Ojo con la ruta: va en SINGULAR, a diferencia del resto de la API.

El cuerpo crudo de la respuesta se guarda siempre. Ya cambiaron el formato una
vez, así que el parseo se mantiene tolerante y aislado en parse_performance():
si mañana cambia un nombre de campo, se corrige ahí y se reprocesa lo guardado
sin volver a consultarle a Mercado Libre.
"""
import json
import time

from src import database, meli_api
from src.progress import update_progress

PERFORMANCE_PATH = "/item/{ml_id}/performance"
SOURCE = "performance"

# Pausa entre llamadas para no golpear el rate limit al auditar el catálogo.
PAUSE_BETWEEN_CALLS = 0.25

# Horas que se considera vigente un diagnóstico. Mercado Libre no recalcula el
# puntaje en tiempo real, así que re-consultar cada pocos minutos no aporta.
DEFAULT_MAX_AGE_HOURS = 12


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _bucket_is_pending(bucket) -> bool:
    """Un objetivo cuenta como pendiente si su status es PENDING.

    Se compara explícitamente contra PENDING en vez de "distinto de COMPLETED"
    para no inflar la cuenta si Mercado Libre agrega un estado intermedio que
    todavía no conocemos. Confirmar contra una respuesta real qué estados usa.
    """
    if not isinstance(bucket, dict):
        return False
    return str(bucket.get('status') or '').strip().upper() == 'PENDING'


def parse_performance(payload) -> dict:
    """Extrae lo necesario del cuerpo de /performance.

    Función pura, sin red ni base: es la única pieza acoplada al formato de
    Mercado Libre y por eso se testea aparte contra respuestas de ejemplo.

    Tolerante a campos ausentes a propósito: que falte un campo no puede
    romper la auditoría del resto del catálogo.
    """
    vacio = {
        'score': None,
        'level': '',
        'calculated_at': '',
        'pending_goals': 0,
        'pending_codes': [],
        'goals_json': '[]',
    }
    if not isinstance(payload, dict):
        return vacio

    buckets = payload.get('buckets')
    if not isinstance(buckets, list):
        buckets = []

    pendientes = [b for b in buckets if _bucket_is_pending(b)]

    return {
        'score': _to_float(payload.get('score')),
        'level': str(payload.get('level') or ''),
        'calculated_at': str(payload.get('calculated_at') or ''),
        'pending_goals': len(pendientes),
        'pending_codes': [
            str(b.get('id') or b.get('name') or '') for b in pendientes
        ],
        'goals_json': json.dumps(buckets, ensure_ascii=False),
    }


def _demo_payload(ml_id: str) -> dict:
    """Respuesta sintética para el modo demo, determinística por publicación."""
    semilla = sum(ord(c) for c in ml_id) % 60
    return {
        "entity_type": "ITEM",
        "entity_id": ml_id,
        "score": 40 + semilla,
        "level": "MEDIUM",
        "level_wording": "Puede mejorar",
        "calculated_at": "2026-01-01T00:00:00.000Z",
        "buckets": [
            {"id": "FICHA_TECNICA", "status": "PENDING", "score": 10, "variables": []},
            {"id": "FOTOS", "status": "COMPLETED", "score": 15, "variables": []},
        ],
    }


def _es_error_de_permisos(error) -> bool:
    """Un 401/403 no es transitorio: lo devuelve la cuenta, no la publicación.

    Sirve para cortar la auditoría en seco en vez de repetir el mismo error una
    vez por publicación. El formato del texto lo produce fetch_performance en
    este mismo módulo, así que la comparación es sobre algo que controlamos.
    """
    texto = str(error or '')
    return 'HTTP 401' in texto or 'HTTP 403' in texto


def fetch_performance(ml_id: str):
    """Trae el diagnóstico de una publicación. Devuelve (payload, error)."""
    if meli_api.is_demo_mode():
        return _demo_payload(ml_id), None

    try:
        response = meli_api.api_request("GET", PERFORMANCE_PATH.format(ml_id=ml_id))
    except ConnectionError as e:
        return None, str(e)

    if response is None:
        return None, "Sin respuesta de Mercado Libre"

    if response.status_code != 200:
        detalle = (response.text or '')[:200]
        return None, f"HTTP {response.status_code}: {detalle}"

    try:
        return response.json(), None
    except ValueError:
        return None, "La respuesta de Mercado Libre no es JSON válido"


def audit_listings(ml_ids, force_refresh: bool = False,
                   max_age_hours: float = DEFAULT_MAX_AGE_HOURS) -> list:
    """Audita las publicaciones indicadas y cachea el resultado.

    Funciona igual con un ml_id que con cuatrocientos: la herramienta siempre
    opera sobre la selección que hizo el usuario, nunca sobre "todo el catálogo"
    por su cuenta.

    El fallo de una publicación no interrumpe las demás: cada una devuelve su
    propio resultado con el error de Mercado Libre si lo hubo.
    """
    ids = []
    for ml_id in (ml_ids or []):
        limpio = str(ml_id or '').strip()
        if limpio and limpio not in ids:
            ids.append(limpio)

    if not ids:
        return []

    frescura = {} if force_refresh else database.get_listing_health_ages(ids)
    resultados = []
    total = len(ids)

    for indice, ml_id in enumerate(ids, start=1):
        update_progress(
            status="auditing_listings",
            progress=int((indice / total) * 100),
            message=f"Auditando calidad de publicaciones ({indice}/{total})...",
            current=indice,
            total=total,
        )

        edad = frescura.get(ml_id)
        if edad is not None and edad < max_age_hours:
            resultados.append({"ml_id": ml_id, "status": "cached", "age_hours": round(edad, 2)})
            continue

        payload, error = fetch_performance(ml_id)
        if error:
            resultados.append({"ml_id": ml_id, "status": "error", "error": error})

            # Un problema de permisos se repetiría idéntico en cada publicación:
            # cortamos para no gastar cientos de llamadas en el mismo error.
            if _es_error_de_permisos(error):
                for restante in ids[indice:]:
                    resultados.append({
                        "ml_id": restante,
                        "status": "skipped",
                        "error": "Auditoría interrumpida por un problema de permisos de la cuenta",
                    })
                break
        else:
            datos = parse_performance(payload)
            datos['source'] = SOURCE
            database.save_listing_health(ml_id, datos)
            resultados.append({
                "ml_id": ml_id,
                "status": "ok",
                "score": datos['score'],
                "level": datos['level'],
                "pending_goals": datos['pending_goals'],
            })

        if indice < total:
            time.sleep(PAUSE_BETWEEN_CALLS)

    update_progress(status="idle", progress=100, message="Auditoría finalizada")
    return resultados
