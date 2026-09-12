"""Imágenes derivadas de la foto real de una publicación.

Lo que hace y lo que no:

  * SÍ: toma la foto que ya está publicada y genera variantes A PARTIR de ella
    (imagen-a-imagen), del mismo modo que el editor con IA del panel de Mercado
    Libre. El producto de la foto es el producto real.
  * NO: generar una foto de producto desde cero con un texto. Eso produce otro
    producto y es tergiversar, por más que se parezca.

Esa diferencia es la única razón por la que este módulo puede existir. Si algún
día se agrega un proveedor que solo hace texto-a-imagen, no sirve para la foto
de un producto y no debe conectarse acá.

La foto de portada nunca se reemplaza: las variantes se agregan como imágenes
secundarias, que es donde Mercado Libre las admite.
"""
import base64
import json
import os
import time
import urllib.request

import requests

from src import database, meli_api

# Directorio servido por la app en /uploads (ver main.py).
DIRECTORIO_SALIDA = os.path.join('uploads', 'ai_listing')
URL_PUBLICA = '/uploads/ai_listing'

RUTA_SUBIDA_ML = "/pictures/items/upload"

# Estilos que Mercado Libre admite como imagen secundaria. Ninguno reemplaza la
# portada ni altera el producto: cambian el entorno o el encuadre.
ESTILOS = {
    'contexto': (
        "Usá esta foto de producto como base y generá una variante del MISMO "
        "producto, sin modificarlo, ubicado en un entorno de uso realista y "
        "prolijo. No agregues texto, logos, marcas de agua ni personas. "
        "Mantené el producto idéntico en forma, color, material y proporciones."
    ),
    'detalle': (
        "Usá esta foto de producto como base y generá un primer plano del MISMO "
        "producto que muestre su terminación y detalle, sobre fondo blanco "
        "limpio. No agregues texto, logos ni marcas de agua. No cambies el "
        "producto: mismo color, misma forma, mismas proporciones."
    ),
    'angulo': (
        "Usá esta foto de producto como base y generá una vista del MISMO "
        "producto desde otro ángulo, sobre fondo blanco limpio. No inventes "
        "partes que no se vean en la original: si un lado no se puede deducir, "
        "elegí un ángulo cercano al de la foto. Sin texto, logos ni personas."
    ),
}

# --- Proveedores ------------------------------------------------------------
#
# No existe hoy un proveedor 100% gratuito que sirva: el nivel gratuito de
# Google no incluye cuota de imágenes (429 "check your plan and billing") y
# Pollinations, el fallback sin clave del generador de videos, pasó a responder
# 403. Lo más cercano a gratis es OpenAI, cuyas cuentas nuevas de API traen
# crédito inicial sin cargar tarjeta, y por eso es el proveedor por defecto.
# El editor con IA que Mercado Libre ofrece en su panel no está expuesto como
# API: se probaron sus rutas plausibles y todas devuelven 404.
PROVEEDOR_IMAGEN_POR_DEFECTO = 'openai_image'

PROVEEDORES_IMAGEN = {
    'openai_image': {
        'nombre': 'OpenAI (edición de imagen)',
        'costo': 'credito inicial gratis',
        'clave_setting': 'openai_api_key',
        'detalle': 'Las cuentas nuevas de la API reciben USD 5 de crédito sin '
                   'cargar tarjeta. En calidad baja alcanza para cientos de '
                   'imágenes, asi que se puede probar sin gastar.',
        'imagen_a_imagen': True,
    },
    'gemini_image': {
        'nombre': 'Google Gemini (imagen)',
        'costo': 'pago',
        'clave_setting': 'gemini_api_key',
        'detalle': 'Usa la misma clave de Gemini que ya tenés, pero las imágenes '
                   'requieren facturación activa en Google: el nivel gratuito no '
                   'incluye cuota de imágenes (devuelve 429).',
        'imagen_a_imagen': True,
    },
}

MODELOS_IMAGEN = [
    {'id': 'gpt-image-2', 'nombre': 'OpenAI GPT Image 2', 'proveedor': 'openai_image',
     'nota': 'Calidad baja: la opción más barata por imagen'},
    {'id': 'gemini-2.5-flash-image', 'nombre': 'Gemini 2.5 Flash Image',
     'proveedor': 'gemini_image', 'nota': 'El más económico de Google'},
    {'id': 'gemini-3.1-flash-image', 'nombre': 'Gemini 3.1 Flash Image',
     'proveedor': 'gemini_image', 'nota': 'Equilibrado'},
    {'id': 'gemini-3-pro-image', 'nombre': 'Gemini 3 Pro Image',
     'proveedor': 'gemini_image', 'nota': 'El de mayor calidad'},
]
MODELO_IMAGEN_POR_DEFECTO = 'gpt-image-2'

# Calidad de OpenAI. 'low' es la que hace que el credito inicial rinda: para
# una imagen secundaria de publicacion alcanza de sobra.
CALIDAD_OPENAI = 'low'
TAMANIO_OPENAI = '1024x1024'


def get_image_config() -> dict:
    """Proveedor de imágenes configurado y modelos elegibles."""
    proveedor = ((database.get_setting('image_provider', '') or '').strip()
                 or PROVEEDOR_IMAGEN_POR_DEFECTO)
    if proveedor not in PROVEEDORES_IMAGEN:
        proveedor = PROVEEDOR_IMAGEN_POR_DEFECTO

    disponibles = {}
    for codigo, datos in PROVEEDORES_IMAGEN.items():
        clave = (database.get_setting(datos['clave_setting'], '') or '').strip()
        disponibles[codigo] = dict(datos, configurado=bool(clave))

    modelos_del_proveedor = [m for m in MODELOS_IMAGEN if m['proveedor'] == proveedor]
    modelo = (database.get_setting('image_model', '') or '').strip()
    if modelo not in [m['id'] for m in modelos_del_proveedor]:
        modelo = modelos_del_proveedor[0]['id'] if modelos_del_proveedor else MODELO_IMAGEN_POR_DEFECTO

    return {
        'provider': proveedor,
        'image_model': modelo,
        'proveedores': disponibles,
        'modelos': modelos_del_proveedor,
        'todos_los_modelos': MODELOS_IMAGEN,
        'estilos': sorted(ESTILOS.keys()),
    }


def _descargar(url: str):
    """Trae los bytes de la foto publicada. Devuelve (bytes, error)."""
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.read(), None
    except Exception as e:
        return None, f"No se pudo descargar la foto de origen: {str(e)[:120]}"


def _generar_con_gemini(bytes_origen: bytes, instruccion: str):
    """Imagen-a-imagen. Devuelve (bytes_png, modelo, error)."""
    clave = (database.get_setting('gemini_api_key', '') or '').strip()
    if not clave:
        return None, None, "No hay una clave de Gemini configurada"

    # get_image_config normaliza el modelo al proveedor activo: leer el setting
    # directo podria mandarle a Google el id de un modelo de OpenAI.
    modelo = get_image_config()['image_model']

    payload = {
        "contents": [{"parts": [
            {"text": instruccion},
            {"inline_data": {
                "mime_type": "image/jpeg",
                "data": base64.b64encode(bytes_origen).decode(),
            }},
        ]}]
    }
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{modelo}:generateContent?key={clave}")

    try:
        res = requests.post(url, json=payload,
                            headers={"Content-Type": "application/json"}, timeout=120)
    except Exception as e:
        return None, modelo, f"{modelo}: {str(e)[:140]}"

    if res.status_code == 429:
        detalle, _codigo = _error_de_openai(res)
        return None, modelo, (
            "El nivel gratuito de Google no incluye generación de imágenes: hay "
            "que activar facturación en la cuenta asociada a la clave. " + detalle)
    if res.status_code != 200:
        detalle, _codigo = _error_de_openai(res)
        return None, modelo, f"{modelo}: {detalle}"

    try:
        candidatos = res.json().get('candidates') or []
        partes = (candidatos[0].get('content') or {}).get('parts') or []
    except Exception:
        return None, modelo, f"{modelo}: respuesta ilegible"

    for parte in partes:
        en_linea = parte.get('inlineData') or parte.get('inline_data') or {}
        datos = en_linea.get('data')
        if datos:
            try:
                return base64.b64decode(datos), modelo, None
            except Exception:
                return None, modelo, f"{modelo}: la imagen devuelta no se pudo decodificar"

    return None, modelo, f"{modelo}: el modelo respondió sin imagen"


def _error_de_openai(res):
    """Saca (mensaje, codigo) del cuerpo de error de OpenAI."""
    try:
        error = (res.json() or {}).get('error') or {}
        mensaje = str(error.get('message') or '').strip()
        codigo = str(error.get('code') or error.get('type') or '').strip()
        if mensaje:
            return mensaje, codigo
    except Exception:
        pass
    return f"HTTP {res.status_code}: {' '.join((res.text or '')[:170].split())}", ''


def _generar_con_openai(bytes_origen: bytes, instruccion: str):
    """Edición de imagen sobre la foto real. Devuelve (bytes_png, modelo, error).

    Se usa /v1/images/edits y no /v1/images/generations: el primero recibe la
    foto publicada como entrada, que es la única forma de que el producto de la
    variante siga siendo el producto real.
    """
    clave = (database.get_setting('openai_api_key', '') or '').strip()
    if not clave:
        return None, None, "No hay una clave de OpenAI configurada"

    modelo = get_image_config()['image_model']

    try:
        res = requests.post(
            "https://api.openai.com/v1/images/edits",
            headers={"Authorization": f"Bearer {clave}"},
            files={"image": ("origen.jpg", bytes_origen, "image/jpeg")},
            data={"model": modelo, "prompt": instruccion,
                  "size": TAMANIO_OPENAI, "quality": CALIDAD_OPENAI, "n": 1},
            timeout=180)
    except Exception as e:
        return None, modelo, f"{modelo}: {str(e)[:140]}"

    if res.status_code != 200:
        # El mensaje de OpenAI es mas preciso que cualquier parafraseo: distingue
        # "sin credito" de "limite de velocidad", y suele traer el link exacto
        # para resolverlo. Se muestra tal cual, con una traduccion corta adelante
        # solo cuando el codigo es inequivoco.
        detalle, codigo = _error_de_openai(res)
        prefijos = {
            'insufficient_quota': 'La cuenta de OpenAI no tiene credito.',
            'credit_balance_exhausted': 'La cuenta de OpenAI no tiene credito.',
            'rate_limit_exceeded': 'Limite de velocidad de OpenAI: esperá unos segundos.',
            'invalid_api_key': 'La clave de OpenAI es invalida o fue revocada.',
            'model_not_found': 'La cuenta no tiene acceso a ese modelo de imagen.',
        }
        prefijo = prefijos.get(codigo, '')
        return None, modelo, (prefijo + ' ' + detalle).strip() or f"{modelo}: HTTP {res.status_code}"

    try:
        datos = (res.json().get('data') or [{}])[0].get('b64_json')
    except Exception:
        return None, modelo, f"{modelo}: respuesta ilegible"

    if not datos:
        return None, modelo, f"{modelo}: la respuesta no trajo imagen"

    try:
        return base64.b64decode(datos), modelo, None
    except Exception:
        return None, modelo, f"{modelo}: la imagen devuelta no se pudo decodificar"


def _generar(proveedor: str, bytes_origen: bytes, instruccion: str):
    """Despacha al proveedor de imágenes configurado."""
    if proveedor == 'openai_image':
        return _generar_con_openai(bytes_origen, instruccion)
    return _generar_con_gemini(bytes_origen, instruccion)


def generate_variants(ml_id: str, item: dict, estilos=None) -> dict:
    """Genera variantes a partir de la foto de portada. Devuelve un dict resultado.

    No sube nada a Mercado Libre: guarda los archivos localmente y devuelve sus
    rutas para que una persona los mire antes de decidir.
    """
    fotos = item.get('pictures') or []
    if not fotos:
        return {'ok': False, 'error': 'La publicación no tiene ninguna foto de la '
                                      'que derivar. Subí al menos una foto real.'}

    origen = fotos[0].get('secure_url') or fotos[0].get('url')
    bytes_origen, error = _descargar(origen)
    if error:
        return {'ok': False, 'error': error}

    config = get_image_config()
    if config['provider'] not in PROVEEDORES_IMAGEN:
        return {'ok': False, 'error': f"Proveedor de imágenes no soportado: {config['provider']}"}

    elegidos = [e for e in (estilos or ['contexto', 'detalle']) if e in ESTILOS]
    if not elegidos:
        return {'ok': False, 'error': 'Ningún estilo válido seleccionado'}

    os.makedirs(DIRECTORIO_SALIDA, exist_ok=True)
    generadas, errores, modelo_usado = [], [], None

    for estilo in elegidos:
        datos, modelo, error = _generar(config['provider'], bytes_origen, ESTILOS[estilo])
        modelo_usado = modelo or modelo_usado
        if error:
            errores.append(f"{estilo}: {error}")
            continue

        nombre = f"{ml_id}_{estilo}_{int(time.time())}.png"
        ruta = os.path.join(DIRECTORIO_SALIDA, nombre)
        try:
            with open(ruta, 'wb') as f:
                f.write(datos)
        except Exception as e:
            errores.append(f"{estilo}: no se pudo guardar ({str(e)[:80]})")
            continue

        generadas.append({
            'estilo': estilo,
            'ruta': ruta,
            'url': f"{URL_PUBLICA}/{nombre}",
            'bytes': len(datos),
        })

    if not generadas:
        return {'ok': False, 'error': ' | '.join(errores) or 'No se generó ninguna imagen'}

    return {
        'ok': True,
        'generadas': generadas,
        'errores': errores,
        'modelo': modelo_usado,
        'origen': origen,
    }


def upload_to_meli(ruta_local: str):
    """Sube un archivo al CDN de Mercado Libre. Devuelve (picture_id, error)."""
    if not os.path.isfile(ruta_local):
        return None, f"No se encuentra el archivo {ruta_local}"

    meli_api.check_and_refresh_token()
    from src import config as cfg
    token = cfg.get_access_token()
    if not token:
        return None, "No hay token de Mercado Libre"

    url = meli_api.API_BASE_URL + RUTA_SUBIDA_ML
    try:
        with open(ruta_local, 'rb') as f:
            archivos = {'file': (os.path.basename(ruta_local), f, 'image/png')}
            res = requests.post(url, headers={'Authorization': f"Bearer {token}"},
                                files=archivos, timeout=60)
    except Exception as e:
        return None, f"Error subiendo la imagen: {str(e)[:140]}"

    if res.status_code not in (200, 201):
        return None, f"HTTP {res.status_code}: {' '.join((res.text or '')[:180].split())}"

    try:
        return res.json().get('id'), None
    except Exception:
        return None, "Mercado Libre respondió sin id de imagen"


def parse_proposed(valor):
    """Las rutas guardadas en el borrador. Devuelve (lista, error)."""
    try:
        datos = json.loads(valor or '[]')
    except ValueError:
        return None, "El borrador de imágenes no es un JSON válido"
    if not isinstance(datos, list):
        return None, "El borrador de imágenes no es una lista"
    return datos, None
