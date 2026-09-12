"""Generación de contenido para cubrir objetivos de calidad de una publicación.

La IA NO diagnostica: recibe el objetivo puntual que la auditoría marcó como
pendiente y genera solo el contenido que lo cubre. Diagnosticar es trabajo de
listing_audit_service.

Este módulo tampoco escribe en Mercado Libre. Produce borradores que quedan
guardados para que una persona los revise, edite o descarte. Aplicarlos es un
paso aparte y explícito.

La regla que manda sobre todas: **nunca inventar un dato técnico**. Si un
atributo no se puede deducir del título o la descripción que ya existen, el
modelo devuelve null y no un valor plausible. Un GTIN inventado es un problema
real con el comprador y con Mercado Libre, no un detalle estético.
"""
import json
import re

import requests

from src import database
from src.utils.meli_questions_service import GEMINI_FALLBACK_MODELS

# Tope de título de Mercado Libre para publicaciones de Argentina.
MAX_CARACTERES_TITULO = 60
MIN_CARACTERES_TITULO = 25
MAX_CARACTERES_DESCRIPCION = 50000

CAMPOS_VALIDOS = ('title', 'description', 'attributes')

# Datos de contacto y canales externos: Mercado Libre sanciona la publicación
# que los incluye. Mismo criterio que ya aplica el servicio de preguntas.
PATRON_TELEFONO = re.compile(
    r'(\+?\d{1,4}[\s-]?)?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}')
PATRON_EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
PATRON_URL = re.compile(r'(https?://|www\.)\S+', re.IGNORECASE)
PALABRAS_DE_CONTACTO = (
    'whatsapp', 'wsp', 'telegram', 'instagram', 'facebook', 'llamanos',
    'llámanos', 'escribinos', 'contactanos', 'contáctanos', 'celular',
    'teléfono', 'telefono', 'correo', 'e-mail', 'email',
)


# =============================================================================
# VALIDACIÓN — corre antes de guardar un borrador y otra vez antes de aplicar
# =============================================================================

def _tiene_datos_de_contacto(texto: str):
    """Devuelve el motivo si el texto viola las políticas, o None si está limpio."""
    minusculas = texto.lower()

    if PATRON_EMAIL.search(texto):
        return "Contiene una dirección de correo electrónico"
    if PATRON_URL.search(texto):
        return "Contiene un enlace externo"

    # Un número suelto puede ser una medida legítima ("bomba 12v", "por 2
    # unidades"). Solo se rechaza si además aparece una palabra de contacto,
    # que es cuando deja de ser una especificación y pasa a ser un teléfono.
    if PATRON_TELEFONO.search(texto):
        if any(palabra in minusculas for palabra in PALABRAS_DE_CONTACTO):
            return "Contiene un teléfono o canal de contacto no permitido"

    for palabra in PALABRAS_DE_CONTACTO:
        if palabra in minusculas:
            return f"Menciona un canal de contacto externo ('{palabra}')"

    return None


def validate_listing_change(field: str, value, catalogo=None):
    """Valida un cambio antes de guardarlo o de mandarlo a Mercado Libre.

    Devuelve (valor_saneado, es_valido, motivo_de_rechazo).

    Se llama dos veces por cambio: al guardar el borrador y otra vez al
    aplicar, porque entre una cosa y la otra una persona pudo editarlo a mano.
    """
    if field not in CAMPOS_VALIDOS:
        return value, False, f"Campo no soportado: {field}"

    # --- Título -------------------------------------------------------------
    if field == 'title':
        texto = " ".join(str(value or '').split())
        if not texto:
            return texto, False, "El título quedó vacío"
        if len(texto) > MAX_CARACTERES_TITULO:
            return texto, False, (
                f"El título tiene {len(texto)} caracteres y Mercado Libre "
                f"admite hasta {MAX_CARACTERES_TITULO}")
        if len(texto) < MIN_CARACTERES_TITULO:
            return texto, False, (
                f"El título tiene {len(texto)} caracteres, muy corto para "
                f"posicionar (mínimo sugerido {MIN_CARACTERES_TITULO})")
        motivo = _tiene_datos_de_contacto(texto)
        if motivo:
            return texto, False, motivo
        return texto, True, ""

    # --- Descripción --------------------------------------------------------
    if field == 'description':
        texto = str(value or '').strip()
        if not texto:
            return texto, False, "La descripción quedó vacía"
        if len(texto) > MAX_CARACTERES_DESCRIPCION:
            return texto, False, "La descripción excede el máximo de Mercado Libre"
        motivo = _tiene_datos_de_contacto(texto)
        if motivo:
            return texto, False, motivo
        return texto, True, ""

    # --- Atributos ----------------------------------------------------------
    # value es un dict {ATTR_ID: valor}. Se valida contra el catálogo de la
    # categoría: un id inexistente o un valor fuera de una lista cerrada hace
    # que Mercado Libre rechace el PUT entero.
    if not isinstance(value, dict):
        return value, False, "Los atributos deben venir como un objeto {id: valor}"

    if not value:
        return value, False, "No hay atributos para aplicar"

    por_id = {}
    for attr in (catalogo or []):
        if isinstance(attr, dict) and attr.get('id'):
            por_id[attr['id']] = attr

    limpio = {}
    for attr_id, valor in value.items():
        if valor is None or str(valor).strip() == '':
            continue  # la IA no lo pudo deducir: se descarta en silencio

        texto = " ".join(str(valor).split())

        if por_id and attr_id not in por_id:
            return value, False, (
                f"El atributo '{attr_id}' no existe en la categoría de esta publicación")

        definicion = por_id.get(attr_id) or {}
        valores_permitidos = definicion.get('values') or []
        if valores_permitidos:
            nombres = {
                str(v.get('name') or '').strip().lower()
                for v in valores_permitidos if isinstance(v, dict)
            }
            if nombres and texto.lower() not in nombres:
                return value, False, (
                    f"'{texto}' no es un valor admitido para '{attr_id}'")

        motivo = _tiene_datos_de_contacto(texto)
        if motivo:
            return value, False, f"{attr_id}: {motivo}"

        limpio[attr_id] = texto

    if not limpio:
        return limpio, False, "No quedó ningún atributo con valor deducible"

    return limpio, True, ""


# =============================================================================
# PROVEEDORES DE IA — uno gratuito por defecto, uno pago opcional
# =============================================================================
#
# El default es Gemini porque tiene nivel gratuito y ya estaba configurado para
# responder preguntas y generar videos: el optimizador no obliga a gastar nada.
# Anthropic queda disponible para quien quiera pagar por mayor calidad, con el
# modelo elegible.
PROVEEDOR_POR_DEFECTO = 'gemini'

PROVEEDORES = {
    'gemini': {
        'nombre': 'Google Gemini',
        'costo': 'gratuito',
        'clave_setting': 'gemini_api_key',
        'detalle': 'Nivel gratuito generoso. Es el que ya usa el sistema para '
                   'responder preguntas de Mercado Libre y generar videos.',
    },
    'anthropic': {
        'nombre': 'Anthropic Claude',
        'costo': 'pago',
        'clave_setting': 'anthropic_api_key',
        'detalle': 'Requiere una clave propia con credito. Se cobra por uso.',
    },
}

# Precios por millon de tokens (entrada / salida) al 2026-06. Se muestran en la
# interfaz para que la eleccion sea informada; no se usan para calcular nada.
MODELOS_ANTHROPIC = [
    {'id': 'claude-opus-5', 'nombre': 'Claude Opus 5',
     'precio': 'USD 5 / 25 por millon de tokens', 'nota': 'El mas capaz'},
    {'id': 'claude-sonnet-5', 'nombre': 'Claude Sonnet 5',
     'precio': 'USD 2 / 10 por millon de tokens', 'nota': 'Equilibrado'},
    {'id': 'claude-haiku-4-5', 'nombre': 'Claude Haiku 4.5',
     'precio': 'USD 1 / 5 por millon de tokens', 'nota': 'El mas barato'},
]
MODELO_ANTHROPIC_POR_DEFECTO = 'claude-opus-5'


def get_ai_config() -> dict:
    """Proveedor configurado y si tiene credencial cargada."""
    proveedor = (database.get_setting('ai_provider', '') or '').strip() or PROVEEDOR_POR_DEFECTO
    if proveedor not in PROVEEDORES:
        proveedor = PROVEEDOR_POR_DEFECTO

    disponibles = {}
    for codigo, datos in PROVEEDORES.items():
        clave = (database.get_setting(datos['clave_setting'], '') or '').strip()
        disponibles[codigo] = dict(datos, configurado=bool(clave))

    return {
        'provider': proveedor,
        'anthropic_model': (database.get_setting('anthropic_model', '') or '').strip()
                           or MODELO_ANTHROPIC_POR_DEFECTO,
        'proveedores': disponibles,
        'modelos_anthropic': MODELOS_ANTHROPIC,
    }


def _llamar_anthropic(prompt: str, max_tokens: int):
    """Devuelve (texto, modelo, error) usando el SDK oficial de Anthropic."""
    clave = (database.get_setting('anthropic_api_key', '') or '').strip()
    if not clave:
        return None, None, "No hay una clave de Anthropic configurada"

    try:
        import anthropic
    except ModuleNotFoundError:
        return None, None, ("Falta instalar el paquete 'anthropic' en el servidor "
                            "(pip install anthropic)")

    modelo = ((database.get_setting('anthropic_model', '') or '').strip()
              or MODELO_ANTHROPIC_POR_DEFECTO)
    cliente = anthropic.Anthropic(api_key=clave)

    try:
        # Sin parametro `thinking`: Opus 5 y Sonnet 5 razonan igual por defecto y
        # Haiku 4.5 no lo admite en esa forma, asi que omitirlo funciona con los
        # tres modelos elegibles.
        respuesta = cliente.messages.create(
            model=modelo,
            max_tokens=max(int(max_tokens or 0), 4096),
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        return None, None, f"{modelo}: {str(e)[:180]}"

    if respuesta.stop_reason == 'refusal':
        return None, None, f"{modelo}: el modelo declino responder"
    if respuesta.stop_reason == 'max_tokens':
        return None, None, f"{modelo}: la respuesta se corto por limite de tokens"

    texto = "".join(b.text for b in respuesta.content if b.type == 'text').strip()
    if not texto:
        return None, None, f"{modelo}: respuesta vacia"
    return texto, modelo, None


def _llamar_modelo(prompt: str, max_tokens: int = 4096, json_mode: bool = False):
    """Despacha al proveedor configurado. Devuelve (texto, modelo, error)."""
    proveedor = get_ai_config()['provider']
    if proveedor == 'anthropic':
        return _llamar_anthropic(prompt, max_tokens)
    return _llamar_gemini(prompt, max_tokens=max_tokens, json_mode=json_mode)


# =============================================================================
# LLAMADA AL MODELO
# =============================================================================

def _llamar_gemini(prompt: str, max_tokens: int = 4096, json_mode: bool = False):
    """Devuelve (texto, modelo_usado, error). Reusa la cascada de modelos.

    Con json_mode se le pide al modelo que responda JSON a nivel de API en vez
    de confiar en que respete la instruccion del prompt. Probando contra la
    cuenta real, pedirlo solo por prompt devolvia prosa cada tanto y la
    sugerencia de atributos se perdia.
    """
    clave = database.get_setting("gemini_api_key", "").strip()
    if not clave:
        return None, None, "No hay una clave de Gemini configurada en Ajustes"

    generacion = {"temperature": 0.2, "maxOutputTokens": max_tokens}
    if json_mode:
        generacion["responseMimeType"] = "application/json"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": generacion,
    }
    headers = {"Content-Type": "application/json"}
    ultimo_error = "No se pudo contactar a ningún modelo"

    for modelo in GEMINI_FALLBACK_MODELS:
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{modelo}:generateContent?key={clave}")
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=40)
            if res.status_code == 200:
                candidatos = res.json().get('candidates', [])
                if candidatos:
                    candidato = candidatos[0]
                    razon = str(candidato.get('finishReason') or '').upper()

                    # Una respuesta cortada a la mitad no sirve: un JSON
                    # truncado no parsea y una descripcion cortada no se puede
                    # publicar. Se avisa con el motivo real en vez de dejar que
                    # falle mas adelante como "no devolvio un JSON".
                    if razon == 'MAX_TOKENS':
                        ultimo_error = (
                            f"{modelo}: la respuesta se corto por limite de tokens")
                        continue

                    partes = candidato.get('content', {}).get('parts') or []
                    texto = partes[0].get('text', '').strip() if partes else ''
                    if texto:
                        return texto, modelo, None
            else:
                ultimo_error = f"{modelo}: HTTP {res.status_code}"
        except Exception as e:
            ultimo_error = f"{modelo}: {str(e)[:120]}"
            continue

    return None, None, ultimo_error


def _extraer_json(texto: str):
    """Saca el JSON de la respuesta aunque venga envuelto en ```json ... ```."""
    if not texto:
        return None
    limpio = texto.strip()
    if limpio.startswith('```'):
        limpio = re.sub(r'^```[a-zA-Z]*\s*', '', limpio)
        limpio = re.sub(r'\s*```$', '', limpio)
    try:
        return json.loads(limpio)
    except ValueError:
        # A veces el modelo agrega una frase antes o después del objeto.
        inicio, fin = limpio.find('{'), limpio.rfind('}')
        if inicio >= 0 and fin > inicio:
            try:
                return json.loads(limpio[inicio:fin + 1])
            except ValueError:
                return None
        return None


# =============================================================================
# GENERACIÓN POR OBJETIVO — un objetivo por llamada
# =============================================================================

def _contexto_producto(item: dict) -> str:
    atributos = item.get('attributes') or []
    cargados = [
        f"  - {a.get('name') or a.get('id')}: {a.get('value_name')}"
        for a in atributos
        if isinstance(a, dict) and a.get('value_name')
    ]
    return (
        f"Titulo actual: {item.get('title') or '(sin titulo)'}\n"
        f"Descripcion actual: {(item.get('_description') or '(sin descripcion)')[:1200]}\n"
        f"Ficha tecnica ya cargada:\n" + ("\n".join(cargados) or "  (vacia)")
    )


def suggest_attributes(item: dict, catalogo: list, faltantes: list,
                       valores_propios: dict = None, alternativas: dict = None):
    """Propone valores para los atributos faltantes. Devuelve (dict, modelo, error).

    `valores_propios` son los valores que el vendedor ya usa para esos mismos
    atributos en otras publicaciones de la categoria. No se copian
    automaticamente: se le pasan al modelo como referencia del vocabulario real
    del negocio, y sigue valiendo la regla de no inventar. Que el vendedor use
    "Generica" como marca en otros productos no prueba que ESTE producto sea de
    esa marca.
    """
    if not faltantes:
        return {}, None, None

    por_id = {a['id']: a for a in (catalogo or []) if isinstance(a, dict) and a.get('id')}
    propios = valores_propios or {}

    lineas = []
    for attr_id in faltantes:
        definicion = por_id.get(attr_id) or {}
        nombre = definicion.get('name') or attr_id
        permitidos = [
            str(v.get('name')) for v in (definicion.get('values') or [])
            if isinstance(v, dict) and v.get('name')
        ][:25]
        detalle = f"  - {attr_id} ({nombre})"
        if permitidos:
            detalle += f" | valores admitidos: {', '.join(permitidos)}"
        usados = propios.get(attr_id) or []
        if usados:
            detalle += (" | lo que este vendedor ya usa en la categoria: "
                        + ", ".join(f"{v} (x{n})" for v, n in usados))
        lineas.append(detalle)

    # Los atributos "de declaracion" no describen el producto: declaran por que
    # un dato no esta. Sin esta aclaracion el modelo los trata como un dato a
    # deducir, no puede deducirlos, y devuelve null para siempre.
    bloque_declaracion = ""
    if alternativas:
        destinos = sorted(set(alternativas.values()))
        if 'EMPTY_GTIN_REASON' in destinos:
            bloque_declaracion = """

ATRIBUTOS DE DECLARACION (caso especial):
EMPTY_GTIN_REASON no es una caracteristica del producto: es la razon por la que
la publicacion no informa codigo de barras. Mercado Libre acepta el GTIN O esta
razon, cualquiera de los dos cumple el objetivo.
Completalo SIEMPRE que el GTIN no aparezca en la informacion de arriba, eligiendo:
  - "El producto es un kit o un pack" si el titulo indica pack, kit o varias unidades
  - "El producto es una pieza artesanal" si se trata de algo hecho a mano
  - "El producto no tiene codigo registrado" en cualquier otro caso
Elegir esta razon NO es inventar un dato: es declarar que el dato no esta."""

    prompt = f"""Sos un especialista en fichas tecnicas de Mercado Libre Argentina.

{_contexto_producto(item)}

ATRIBUTOS A COMPLETAR:
{chr(10).join(lineas)}

REGLA MAS IMPORTANTE: no inventes. Completa un atributo UNICAMENTE si su valor
se deduce sin ambiguedad del titulo, de la descripcion o de la ficha ya
cargada. Si no lo podes deducir con certeza, devolve null para ese atributo.
Un dato tecnico inventado es peor que un atributo vacio.

Nunca inventes codigos de barras, GTIN, EAN, numeros de parte ni modelos que no
aparezcan textualmente en la informacion de arriba.

Si el atributo tiene valores admitidos, elegi exactamente uno de esa lista.{bloque_declaracion}

Cuando se indica lo que el vendedor ya usa en la categoria, tomalo como
referencia de vocabulario y formato, NO como respuesta. Que lo use en otros
productos no prueba que ESTE lo tenga: usalo solo si ademas se deduce de la
informacion de esta publicacion.

Respondé SOLO un objeto JSON, sin explicaciones ni markdown, con esta forma:
{{"ATRIBUTO_ID": "valor" o null}}"""

    texto, modelo, error = _llamar_modelo(prompt, max_tokens=4096, json_mode=True)
    if error:
        return None, None, error

    datos = _extraer_json(texto)
    if not isinstance(datos, dict):
        return None, modelo, "El modelo no devolvió un JSON interpretable"

    # Solo se conservan los atributos que se pidieron: si el modelo agrega otros
    # por su cuenta, se descartan.
    propuesta = {
        attr_id: valor for attr_id, valor in datos.items()
        if attr_id in faltantes and valor is not None and str(valor).strip() != ''
    }
    return propuesta, modelo, None


def suggest_title(item: dict):
    """Propone un título mejor. Devuelve (texto, modelo, error)."""
    prompt = f"""Sos un especialista en posicionamiento de Mercado Libre Argentina.

{_contexto_producto(item)}

Escribi un titulo mejor para esta publicacion.

REGLAS:
- Maximo {MAX_CARACTERES_TITULO} caracteres. Es un limite duro de Mercado Libre.
- Empeza por el producto, seguido de marca, modelo y caracteristicas que lo
  distingan (medida, capacidad, cantidad por pack).
- Usa solo informacion que ya aparezca arriba. No inventes marca, modelo,
  material ni medidas.
- Sin datos de contacto, sin enlaces, sin nombres de otras tiendas.
- Sin signos de exclamacion ni palabras promocionales tipo OFERTA o LIQUIDACION.

Respondé SOLO el titulo, en una linea, sin comillas ni explicaciones."""

    texto, modelo, error = _llamar_modelo(prompt, max_tokens=2048)
    if error:
        return None, None, error
    return " ".join(str(texto or '').split()), modelo, None


def suggest_description(item: dict):
    """Propone una descripción. Devuelve (texto, modelo, error)."""
    prompt = f"""Sos un redactor de fichas de producto para Mercado Libre Argentina.

{_contexto_producto(item)}

Escribi una descripcion para esta publicacion.

REGLAS:
- Entre 400 y 1200 caracteres.
- Estructura: un parrafo de que es y para que sirve, y despues una lista de
  caracteristicas con guiones.
- Usa solo informacion que ya aparezca arriba. No inventes especificaciones,
  materiales, medidas, garantias ni certificaciones.
- Sin datos de contacto, sin enlaces, sin redes sociales, sin mencionar otros
  canales de venta.
- Texto plano, sin HTML ni markdown.

Respondé SOLO la descripcion."""

    texto, modelo, error = _llamar_modelo(prompt, max_tokens=8192)
    if error:
        return None, None, error
    return str(texto or '').strip(), modelo, None


# =============================================================================
# PROGRESO DE LA GENERACIÓN EN LOTE
# =============================================================================
#
# Estado propio y no el de src.progress: ese lo usa la sincronización de
# Mercado Libre y el inventario lo consulta para su barra. Compartirlo haría
# que una generación pisara el progreso de un sync en curso.
import threading

_lock_progreso = threading.Lock()
_progreso = {
    'status': 'idle',        # idle | running | completed | failed
    'current': 0,
    'total': 0,
    'message': '',
    'ml_ids': [],            # sobre qué publicaciones corrió, para la revisión
    'borradores': 0,
    'errores': [],
}


def get_bulk_progress() -> dict:
    with _lock_progreso:
        return dict(_progreso)


def _set_progreso(**campos):
    with _lock_progreso:
        _progreso.update(campos)


def generate_suggestions_bulk(ml_ids, incluir_imagenes: bool = False):
    """Genera propuestas para varias publicaciones, informando progreso.

    Pensada para correr en segundo plano: generar para veinte publicaciones son
    decenas de llamadas al modelo y la petición HTTP se cortaría por timeout.
    """
    from src.utils import listing_image_service
    from src.utils import listing_apply_service

    ids = [str(m).strip() for m in (ml_ids or []) if str(m or '').strip()]
    _set_progreso(status='running', current=0, total=len(ids), borradores=0,
                  errores=[], ml_ids=ids, message='Empezando...')

    borradores, errores = 0, []
    try:
        for indice, ml_id in enumerate(ids, start=1):
            _set_progreso(current=indice,
                          message=f"Generando propuestas ({indice} de {len(ids)})...")

            for resultado in generate_suggestions([ml_id]):
                if resultado['status'] != 'ok':
                    errores.append(f"{ml_id}: {resultado.get('error')}")
                    continue
                for sugerencia in resultado.get('sugerencias', []):
                    if sugerencia.get('status') == 'draft':
                        borradores += 1
                    elif sugerencia.get('error'):
                        errores.append(f"{ml_id} ({sugerencia['field']}): {sugerencia['error']}")

            if incluir_imagenes:
                item, error = listing_apply_service._leer_item(ml_id)
                if error:
                    errores.append(f"{ml_id} (imagenes): {error}")
                else:
                    salida = listing_image_service.generate_variants(ml_id, item)
                    if salida.get('ok'):
                        database.delete_pending_suggestions(ml_id, 'pictures')
                        rutas = [{"ruta": g['ruta'], "url": g['url'], "estilo": g['estilo']}
                                 for g in salida['generadas']]
                        database.save_listing_suggestion(
                            ml_id=ml_id, field='pictures', goal_code='FOTOS',
                            current_value=json.dumps(
                                [p.get('secure_url') for p in (item.get('pictures') or [])],
                                ensure_ascii=False),
                            proposed_value=json.dumps(rutas, ensure_ascii=False),
                            status='draft', model_used=salida.get('modelo'))
                        borradores += 1
                    else:
                        errores.append(f"{ml_id} (imagenes): {salida.get('error')}")

            _set_progreso(borradores=borradores, errores=errores[:20])

        _set_progreso(status='completed', borradores=borradores, errores=errores[:20],
                      message=f"Listo: {borradores} propuestas generadas")
    except Exception as e:
        _set_progreso(status='failed', message=str(e)[:200], errores=errores[:20])


# =============================================================================
# ORQUESTACIÓN — de los objetivos pendientes a borradores guardados
# =============================================================================

def generate_suggestions(ml_ids, targets=None) -> list:
    """Genera borradores para las publicaciones indicadas.

    Siempre sobre la selección explícita del usuario. No escribe nada en
    Mercado Libre: deja borradores en estado 'draft' para que alguien los
    revise. Los que no pasan la validación quedan como 'failed' con el motivo,
    que es más útil que descartarlos en silencio.

    `targets` limita qué campos generar; sin él se generan los objetivos que la
    auditoría marcó como pendientes.
    """
    from src.utils import listing_audit_service

    ids = []
    for ml_id in (ml_ids or []):
        limpio = str(ml_id or '').strip()
        if limpio and limpio not in ids:
            ids.append(limpio)
    if not ids:
        return []

    cache_categorias = {}
    resultados = []

    for ml_id in ids:
        contexto, error = listing_audit_service.fetch_listing_context(ml_id, cache_categorias)
        if error:
            resultados.append({"ml_id": ml_id, "status": "error", "error": error})
            continue

        item = contexto['item']
        catalogo = contexto['catalogo']
        auditoria = listing_audit_service.compute_local_audit(item, catalogo)
        pendientes = set(auditoria['pending_codes'])

        objetivos = json.loads(auditoria['goals_json'])
        detalle_ficha = next(
            (o['detail'] for o in objetivos if o['id'] == 'FICHA_TECNICA'), {})

        # Las fotos no se generan con IA: tienen que ser del producto real. Si es
        # lo unico que falta, hay que decirlo con todas las letras en vez de
        # devolver "no hay objetivos pendientes", que es enganoso.
        solo_faltan_fotos = pendientes and pendientes.issubset({'FOTOS'})

        a_generar = targets or [
            {'FICHA_TECNICA': 'attributes', 'TITULO': 'title',
             'DESCRIPCION': 'description'}[codigo]
            for codigo in pendientes
            if codigo in ('FICHA_TECNICA', 'TITULO', 'DESCRIPCION')
        ]

        generados = []
        for field in a_generar:
            if field == 'attributes':
                faltantes = (detalle_ficha.get('faltan_requeridos') or []) + \
                            (detalle_ficha.get('faltan_condicionales') or [])
                # Un GTIN no se deduce ni se inventa, pero Mercado Libre acepta
                # declarar por que el producto no tiene codigo. Se le ofrece esa
                # alternativa al modelo junto al atributo original.
                for alternativo in (detalle_ficha.get('alternativas') or {}).values():
                    if alternativo not in faltantes:
                        faltantes.append(alternativo)

                if not faltantes:
                    continue

                valores_propios = listing_audit_service.fetch_own_category_values(
                    item.get('category_id'), exclude_ml_id=ml_id)
                propuesta, modelo, error_ia = suggest_attributes(
                    item, catalogo, faltantes, valores_propios,
                    alternativas=detalle_ficha.get('alternativas'))
                if error_ia:
                    generados.append({"field": field, "status": "error", "error": error_ia})
                    continue
                if not propuesta:
                    # El modelo no pudo deducir ninguno. Es el resultado correcto
                    # cuando el dato no está: no se inventa nada.
                    generados.append({
                        "field": field, "status": "sin_datos",
                        "error": "Ninguno de los atributos faltantes se puede deducir "
                                 "de la información de la publicación"})
                    continue
                valor_actual = json.dumps({
                    a.get('id'): a.get('value_name')
                    for a in (item.get('attributes') or []) if isinstance(a, dict)
                }, ensure_ascii=False)
                propuesto_bruto = propuesta
                goal_code = 'FICHA_TECNICA'

            elif field == 'title':
                propuesto_bruto, modelo, error_ia = suggest_title(item)
                if error_ia:
                    generados.append({"field": field, "status": "error", "error": error_ia})
                    continue
                valor_actual = str(item.get('title') or '')
                goal_code = 'TITULO'

            elif field == 'description':
                propuesto_bruto, modelo, error_ia = suggest_description(item)
                if error_ia:
                    generados.append({"field": field, "status": "error", "error": error_ia})
                    continue
                valor_actual = str(item.get('_description') or '')
                goal_code = 'DESCRIPCION'

            else:
                generados.append({"field": field, "status": "error",
                                  "error": f"Campo no soportado: {field}"})
                continue

            saneado, es_valido, motivo = validate_listing_change(field, propuesto_bruto, catalogo)
            texto_propuesto = (json.dumps(saneado, ensure_ascii=False)
                               if field == 'attributes' else str(saneado))

            # Regenerar reemplaza la propuesta anterior de ese campo. Sin esto
            # cada clic en "Generar con IA" apilaba otra ficha tecnica igual.
            database.delete_pending_suggestions(ml_id, field)

            suggestion_id = database.save_listing_suggestion(
                ml_id=ml_id, field=field, goal_code=goal_code,
                current_value=valor_actual, proposed_value=texto_propuesto,
                status='draft' if es_valido else 'failed',
                model_used=modelo, reject_reason=None if es_valido else motivo)

            generados.append({
                "field": field, "suggestion_id": suggestion_id,
                "status": "draft" if es_valido else "failed",
                "error": None if es_valido else motivo,
                "model_used": modelo,
            })

        if not generados and solo_faltan_fotos:
            generados.append({
                "field": "pictures", "status": "manual",
                "error": "El unico objetivo pendiente son las fotos, y esas tienen "
                         "que ser del producto real: no se generan con IA. Sacá 2 o 3 "
                         "fotos mas y subilas desde Mercado Libre, donde ademas "
                         "tenes su editor con IA para estandarizar el fondo.",
            })

        resultados.append({"ml_id": ml_id, "status": "ok", "sugerencias": generados})

    return resultados
