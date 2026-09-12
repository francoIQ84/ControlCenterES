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
# Hoy solo hay uno que sirva: Gemini con facturación activa. El nivel gratuito
# de Google no incluye cuota de imágenes (devuelve 429 "check your plan and
# billing"), y Pollinations, el fallback gratuito que usaba el generador de
# videos, empezó a responder 403. Se deja la estructura de proveedores para
# enchufar otro cuando aparezca, pero no se ofrece uno gratuito que no funcione.
PROVEEDOR_IMAGEN_POR_DEFECTO = 'gemini_image'

PROVEEDORES_IMAGEN = {
    'gemini_image': {
        'nombre': 'Google Gemini (imagen)',
        'costo': 'pago',
        'clave_setting': 'gemini_api_key',
        'detalle': 'Usa la misma clave de Gemini que ya tenés, pero las imágenes '
                   'requieren facturación activa en Google: el nivel gratuito no '
                   'incluye cuota de imágenes.',
        'imagen_a_imagen': True,
    },
}

MODELOS_IMAGEN = [
    {'id': 'gemini-2.5-flash-image', 'nombre': 'Gemini 2.5 Flash Image',
     'nota': 'El más económico'},
    {'id': 'gemini-3.1-flash-image', 'nombre': 'Gemini 3.1 Flash Image',
     'nota': 'Equilibrado'},
    {'id': 'gemini-3-pro-image', 'nombre': 'Gemini 3 Pro Image',
     'nota': 'El de mayor calidad'},
]
MODELO_IMAGEN_POR_DEFECTO = 'gemini-2.5-flash-image'


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

    return {
        'provider': proveedor,
        'image_model': ((database.get_setting('image_model', '') or '').strip()
                        or MODELO_IMAGEN_POR_DEFECTO),
        'proveedores': disponibles,
        'modelos': MODELOS_IMAGEN,
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

    modelo = ((database.get_setting('image_model', '') or '').strip()
              or MODELO_IMAGEN_POR_DEFECTO)

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
        return None, modelo, (
            f"{modelo}: sin cuota de imágenes. El nivel gratuito de Google no "
            f"incluye generación de imágenes; hay que activar facturación en "
            f"la cuenta de Google asociada a la clave.")
    if res.status_code != 200:
        return None, modelo, f"{modelo}: HTTP {res.status_code} {' '.join((res.text or '')[:160].split())}"

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
    if config['provider'] != 'gemini_image':
        return {'ok': False, 'error': f"Proveedor de imágenes no soportado: {config['provider']}"}

    elegidos = [e for e in (estilos or ['contexto', 'detalle']) if e in ESTILOS]
    if not elegidos:
        return {'ok': False, 'error': 'Ningún estilo válido seleccionado'}

    os.makedirs(DIRECTORIO_SALIDA, exist_ok=True)
    generadas, errores, modelo_usado = [], [], None

    for estilo in elegidos:
        datos, modelo, error = _generar_con_gemini(bytes_origen, ESTILOS[estilo])
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
