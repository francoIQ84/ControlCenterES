"""Auditoría de calidad de publicaciones de Mercado Libre.

Este módulo es de SOLO LECTURA: nunca modifica una publicación.

Hay dos estrategias:

  'local' (la que se usa)
      Calculamos los objetivos nosotros a partir de /items/{id} y
      /categories/{id}/attributes, que la cuenta sí puede consultar. Es una
      APROXIMACIÓN a los criterios de Mercado Libre: la lista de objetivos es
      accionable y honesta, pero no es el puntaje oficial y puede no coincidir
      con lo que el vendedor ve en su panel. Por eso no se inventa un puntaje
      0-100 que se pueda confundir con el de ML: se reporta cuántos objetivos
      quedan pendientes y qué tan completa está la ficha técnica.

  'performance' (preparada, hoy no disponible)
      El dato oficial de /item/{id}/performance. La cuenta recibe 403 en ese
      recurso pese a tener token válido y scopes amplios, así que queda listo
      para cuando Mercado Libre lo habilite. Ojo con la ruta: va en SINGULAR,
      a diferencia del resto de la API. El viejo /items/{id}/health no sirve:
      es para clasificados, responde "buying mode 'buy_it_now' not allowed".

El cuerpo crudo de lo que se consultó se guarda siempre, así que si cambian
los criterios se recalcula sobre lo guardado sin volver a consultar.
"""
import json
import time

from src import database, meli_api
from src.progress import update_progress

PERFORMANCE_PATH = "/item/{ml_id}/performance"

# Pausa entre publicaciones para no golpear el rate limit al auditar el catálogo.
PAUSE_BETWEEN_CALLS = 0.25

# Horas que se considera vigente un diagnóstico.
DEFAULT_MAX_AGE_HOURS = 12

# --- Umbrales de la auditoría local -----------------------------------------
# Valores de referencia, no reglas de Mercado Libre. Están acá arriba y con
# nombre para que se puedan discutir y ajustar sin leer el algoritmo.
MIN_FOTOS_RECOMENDADAS = 3
MIN_CARACTERES_DESCRIPCION = 200
MIN_CARACTERES_TITULO = 25

# Atributos fiscales o de comercio exterior: Mercado Libre los marca como
# condicionales pero no son datos del producto, y aparecen como faltantes en
# prácticamente toda publicación local. Se informan aparte para que no ensucien
# la cuenta de objetivos reales.
ATRIBUTOS_FISCALES = {'VALUE_ADDED_TAX', 'IMPORT_DUTY'}


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _es_error_de_permisos(error) -> bool:
    """Un 401/403 no es transitorio: lo devuelve la cuenta, no la publicación.

    Sirve para cortar la auditoría en seco en vez de repetir el mismo error una
    vez por publicación. El formato del texto lo produce este mismo módulo, así
    que la comparación es sobre algo que controlamos.
    """
    texto = str(error or '')
    return 'HTTP 401' in texto or 'HTTP 403' in texto


def _get_json(path):
    """GET autenticado contra Mercado Libre. Devuelve (payload, error)."""
    try:
        response = meli_api.api_request("GET", path)
    except ConnectionError as e:
        return None, str(e)

    if response is None:
        return None, "Sin respuesta de Mercado Libre"

    if response.status_code != 200:
        detalle = " ".join((response.text or '')[:200].split())
        return None, f"HTTP {response.status_code}: {detalle}"

    try:
        return response.json(), None
    except ValueError:
        return None, "La respuesta de Mercado Libre no es JSON válido"


# =============================================================================
# ESTRATEGIA OFICIAL (/performance) — preparada, hoy devuelve 403
# =============================================================================

def _bucket_is_pending(bucket) -> bool:
    """Un objetivo cuenta como pendiente si su status es PENDING.

    Se compara explícitamente contra PENDING y no contra "distinto de
    COMPLETED" para no inflar la cuenta si Mercado Libre agrega un estado
    intermedio que todavía no conocemos.
    """
    if not isinstance(bucket, dict):
        return False
    return str(bucket.get('status') or '').strip().upper() == 'PENDING'


def parse_performance(payload) -> dict:
    """Extrae lo necesario del cuerpo de /performance. Función pura.

    Tolerante a campos ausentes a propósito: que falte un campo no puede
    romper la auditoría del resto del catálogo.
    """
    vacio = {
        'score': None, 'level': '', 'calculated_at': '',
        'pending_goals': 0, 'pending_codes': [], 'goals_json': '[]',
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
        'pending_codes': [str(b.get('id') or b.get('name') or '') for b in pendientes],
        'goals_json': json.dumps(buckets, ensure_ascii=False),
    }


def fetch_performance(ml_id: str):
    """Trae el diagnóstico oficial de una publicación. Devuelve (payload, error)."""
    if meli_api.is_demo_mode():
        return _demo_performance(ml_id), None
    return _get_json(PERFORMANCE_PATH.format(ml_id=ml_id))


def _demo_performance(ml_id: str) -> dict:
    semilla = sum(ord(c) for c in ml_id) % 60
    return {
        "entity_type": "ITEM", "entity_id": ml_id,
        "score": 40 + semilla, "level": "MEDIUM", "level_wording": "Puede mejorar",
        "calculated_at": "2026-01-01T00:00:00.000Z",
        "buckets": [
            {"id": "FICHA_TECNICA", "status": "PENDING", "score": 10, "variables": []},
            {"id": "FOTOS", "status": "COMPLETED", "score": 15, "variables": []},
        ],
    }


# =============================================================================
# ESTRATEGIA LOCAL — objetivos calculados por nosotros
# =============================================================================

def _objetivo(codigo, pendiente, detalle):
    """Objetivo con la misma forma que un bucket de ML, para que la UI sea una sola."""
    return {
        "id": codigo,
        "status": "PENDING" if pendiente else "COMPLETED",
        "detail": detalle,
    }


def compute_local_audit(item, category_attributes) -> dict:
    """Deriva los objetivos de una publicación. Función pura, sin red ni base.

    `item` es el cuerpo de /items/{id} y `category_attributes` el de
    /categories/{id}/attributes.

    No devuelve puntaje: la cuenta de objetivos pendientes es lo que se puede
    afirmar con honestidad. Inventar un 0-100 se confundiría con el de Mercado
    Libre y no coincidiría.
    """
    item = item if isinstance(item, dict) else {}
    catalogo = category_attributes if isinstance(category_attributes, list) else []

    atributos = item.get('attributes') or []
    cargados = {
        a.get('id') for a in atributos
        if isinstance(a, dict) and (a.get('value_name') or a.get('value_id'))
    }

    def tiene_tag(attr, tag):
        return isinstance(attr, dict) and tag in (attr.get('tags') or {})

    requeridos = [a for a in catalogo if tiene_tag(a, 'required')]
    condicionales = [
        a for a in catalogo
        if tiene_tag(a, 'catalog_required') or tiene_tag(a, 'conditional_required')
    ]

    faltan_requeridos = [a['id'] for a in requeridos if a.get('id') not in cargados]
    faltan_condicionales, faltan_fiscales = [], []
    for attr in condicionales:
        codigo = attr.get('id')
        if codigo in cargados:
            continue
        (faltan_fiscales if codigo in ATRIBUTOS_FISCALES else faltan_condicionales).append(codigo)

    ficha_pendiente = bool(faltan_requeridos or faltan_condicionales)

    fotos = len(item.get('pictures') or [])
    titulo = str(item.get('title') or '')
    # La descripción no viene en /items: la completa el llamador si la tiene.
    descripcion = str(item.get('_description') or '')

    objetivos = [
        _objetivo('FICHA_TECNICA', ficha_pendiente, {
            'cargados': len(cargados),
            'total_catalogo': len(catalogo),
            'faltan_requeridos': faltan_requeridos,
            'faltan_condicionales': faltan_condicionales,
            'faltan_fiscales': faltan_fiscales,
        }),
        _objetivo('FOTOS', fotos < MIN_FOTOS_RECOMENDADAS, {
            'cantidad': fotos,
            'recomendadas': MIN_FOTOS_RECOMENDADAS,
        }),
        _objetivo('TITULO', len(titulo) < MIN_CARACTERES_TITULO, {
            'caracteres': len(titulo),
            'minimo_sugerido': MIN_CARACTERES_TITULO,
        }),
        _objetivo('DESCRIPCION', len(descripcion) < MIN_CARACTERES_DESCRIPCION, {
            'caracteres': len(descripcion),
            'minimo_sugerido': MIN_CARACTERES_DESCRIPCION,
        }),
    ]

    pendientes = [o for o in objetivos if o['status'] == 'PENDING']
    return {
        'score': None,          # deliberadamente vacío: ver el docstring
        'level': 'LOCAL',
        'calculated_at': '',
        'category_id': item.get('category_id'),
        'pending_goals': len(pendientes),
        'pending_codes': [o['id'] for o in pendientes],
        'goals_json': json.dumps(objetivos, ensure_ascii=False),
        'attributes_json': json.dumps(atributos, ensure_ascii=False),
    }


def _fetch_local(ml_id: str, cache_categorias: dict):
    """Trae lo necesario para la auditoría local. Devuelve (datos, error).

    El catálogo de atributos se cachea por categoría durante la corrida: un
    catálogo de 94 publicaciones suele repartirse en pocas decenas de
    categorías, y pedirlo una vez por publicación sería desperdicio puro.
    """
    item, error = _get_json("/items/" + ml_id)
    if error:
        return None, error

    categoria = (item or {}).get('category_id')
    catalogo = []
    if categoria:
        if categoria in cache_categorias:
            catalogo = cache_categorias[categoria]
        else:
            catalogo, error_cat = _get_json("/categories/" + str(categoria) + "/attributes")
            if error_cat:
                # Sin catálogo igual se auditan fotos, título y descripción.
                catalogo = []
            cache_categorias[categoria] = catalogo

    # /items/{id} no trae la descripción: viene de nuestro cache, que ya la
    # sincroniza. Se inyecta en el item para que compute_local_audit siga
    # siendo una función pura sobre un solo diccionario.
    item['_description'] = database.get_product_description(ml_id) or ''

    return {'item': item, 'catalogo': catalogo}, None


def fetch_listing_context(ml_id: str, cache_categorias: dict = None):
    """Publicación + catálogo de atributos de su categoría. Devuelve (datos, error).

    Lo usa el generador de sugerencias para no duplicar la logica de traida ni
    el cacheo de catalogos por categoria.
    """
    return _fetch_local(ml_id, cache_categorias if cache_categorias is not None else {})


# =============================================================================
# ORQUESTACIÓN
# =============================================================================

def audit_listings(ml_ids, force_refresh: bool = False,
                   max_age_hours: float = DEFAULT_MAX_AGE_HOURS,
                   strategy: str = 'local') -> list:
    """Audita las publicaciones indicadas y cachea el resultado.

    Funciona igual con un ml_id que con cuatrocientos: la herramienta siempre
    opera sobre la selección que hizo el usuario, nunca sobre "todo el
    catálogo" por su cuenta.

    El fallo de una publicación no interrumpe las demás, salvo que sea un
    problema de permisos de la cuenta, que se repetiría idéntico en todas.
    """
    ids = []
    for ml_id in (ml_ids or []):
        limpio = str(ml_id or '').strip()
        if limpio and limpio not in ids:
            ids.append(limpio)

    if not ids:
        return []

    frescura = {} if force_refresh else database.get_listing_health_ages(ids)
    cache_categorias = {}
    resultados = []
    total = len(ids)

    for indice, ml_id in enumerate(ids, start=1):
        update_progress(
            status="auditing_listings",
            progress=int((indice / total) * 100),
            message=f"Auditando calidad de publicaciones ({indice}/{total})...",
            current=indice, total=total,
        )

        edad = frescura.get(ml_id)
        if edad is not None and edad < max_age_hours:
            resultados.append({"ml_id": ml_id, "status": "cached", "age_hours": round(edad, 2)})
            continue

        if strategy == 'performance':
            payload, error = fetch_performance(ml_id)
            datos = parse_performance(payload) if not error else None
        else:
            crudo, error = _fetch_local(ml_id, cache_categorias)
            datos = compute_local_audit(crudo['item'], crudo['catalogo']) if not error else None

        if error:
            resultados.append({"ml_id": ml_id, "status": "error", "error": error})
            if _es_error_de_permisos(error):
                for restante in ids[indice:]:
                    resultados.append({
                        "ml_id": restante, "status": "skipped",
                        "error": "Auditoría interrumpida por un problema de permisos de la cuenta",
                    })
                break
        else:
            datos['source'] = strategy
            database.save_listing_health(ml_id, datos)
            resultados.append({
                "ml_id": ml_id, "status": "ok",
                "score": datos.get('score'),
                "level": datos.get('level'),
                "pending_goals": datos['pending_goals'],
                "pending_codes": datos['pending_codes'],
            })

        if indice < total:
            time.sleep(PAUSE_BETWEEN_CALLS)

    update_progress(status="idle", progress=100, message="Auditoría finalizada")
    return resultados
