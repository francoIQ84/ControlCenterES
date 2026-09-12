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
# LLAMADA AL MODELO
# =============================================================================

def _llamar_gemini(prompt: str, max_tokens: int = 1024, json_mode: bool = False):
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
            res = requests.post(url, headers=headers, json=payload, timeout=25)
            if res.status_code == 200:
                candidatos = res.json().get('candidates', [])
                if candidatos and candidatos[0].get('content', {}).get('parts'):
                    texto = candidatos[0]['content']['parts'][0].get('text', '').strip()
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


def suggest_attributes(item: dict, catalogo: list, faltantes: list):
    """Propone valores para los atributos faltantes. Devuelve (dict, modelo, error)."""
    if not faltantes:
        return {}, None, None

    por_id = {a['id']: a for a in (catalogo or []) if isinstance(a, dict) and a.get('id')}

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
        lineas.append(detalle)

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

Si el atributo tiene valores admitidos, elegi exactamente uno de esa lista.

Respondé SOLO un objeto JSON, sin explicaciones ni markdown, con esta forma:
{{"ATRIBUTO_ID": "valor" o null}}"""

    texto, modelo, error = _llamar_gemini(prompt, max_tokens=800, json_mode=True)
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

    texto, modelo, error = _llamar_gemini(prompt, max_tokens=120)
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

    texto, modelo, error = _llamar_gemini(prompt, max_tokens=1400)
    if error:
        return None, None, error
    return str(texto or '').strip(), modelo, None


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
                if not faltantes:
                    continue
                propuesta, modelo, error_ia = suggest_attributes(item, catalogo, faltantes)
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

        resultados.append({"ml_id": ml_id, "status": "ok", "sugerencias": generados})

    return resultados
