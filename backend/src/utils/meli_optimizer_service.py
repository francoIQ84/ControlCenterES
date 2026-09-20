"""
Servicio de optimización de publicaciones de Mercado Libre con IA (Gemini).

Audita las publicaciones contra los requerimientos de su categoría en ML,
genera optimizaciones con Gemini AI (títulos SEO, descripciones profesionales,
atributos faltantes), y aplica los cambios vía API.

Modo por defecto: borrador (draft) — genera sugerencias para revisión manual.
"""

import json
import re
import time
import traceback
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from src import database, config, meli_api

# ───────────────────────────────────────────────────────────────────────
# Constantes y modelos Gemini con fallback
# ───────────────────────────────────────────────────────────────────────

GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-2.0-flash",
]

# Pesos para cálculo de score de salud interno
SCORE_WEIGHTS = {
    "title":       15,   # Calidad del título
    "description": 15,   # Calidad de la descripción
    "photos":      20,   # Cantidad y calidad de fotos
    "attributes":  25,   # Completitud de ficha técnica
    "shipping":    10,   # Envío gratis
    "video":        5,   # Tiene video
    "status":      10,   # Estado (activo, etc.)
}


# ───────────────────────────────────────────────────────────────────────
# Auditoría de una publicación individual
# ───────────────────────────────────────────────────────────────────────

def audit_single_item(ml_id: str) -> dict:
    """Audita una publicación contra los requerimientos de su categoría.

    Retorna un diccionario con:
      - ml_id, title, thumbnail, status
      - score (0-100)
      - issues (lista de problemas detectados)
      - opportunities (lista de mejoras posibles)
      - details (desglose por área)
    """
    # Obtener datos completos del item desde ML
    item_data = meli_api.fetch_item_full_details(ml_id)
    if not item_data:
        return {
            "ml_id": ml_id,
            "score": 0,
            "error": "No se pudieron obtener los datos de la publicación",
            "issues": [],
            "opportunities": [],
            "details": {},
        }

    # Obtener atributos requeridos por la categoría
    category_id = item_data.get("category_id", "")
    category_attrs = []
    if category_id:
        category_attrs = meli_api.fetch_category_attributes(category_id)
        # Cachear en DB
        if category_attrs:
            database.cache_meli_category_attrs(category_id, category_attrs)
        else:
            # Intentar leer del cache local
            category_attrs = database.get_cached_meli_category_attrs(category_id) or []

    # Ejecutar auditoría
    details = {}
    issues = []
    opportunities = []

    is_catalog = bool(item_data.get("catalog_listing"))
    sold_quantity = int(item_data.get("sold_quantity") or 0)

    # 1. Título
    title = item_data.get("title", "")
    title_score, title_issues, title_opps = _audit_title(title, item_data)
    if is_catalog:
        title_score = 100
        title_issues = []
        title_opps = []
    details["title"] = {
        "score": title_score,
        "current": title,
        "catalog_managed": is_catalog,
        "has_sales": sold_quantity > 0,
    }
    issues.extend(title_issues)
    opportunities.extend(title_opps)

    # 2. Descripción
    description = item_data.get("description", "") or ""
    if is_catalog:
        # En catálogo oficial de Mercado Libre la descripción la gestiona ML
        desc_score = 100
        desc_issues = []
        desc_opps = []
        details["description"] = {
            "score": desc_score,
            "current_length": len(description),
            "catalog_managed": True,
        }
    else:
        desc_score, desc_issues, desc_opps = _audit_description(description)
        details["description"] = {"score": desc_score, "current_length": len(description)}
        issues.extend(desc_issues)
        opportunities.extend(desc_opps)

    # 3. Fotos
    pictures = item_data.get("pictures", [])
    photos_score, photos_issues, photos_opps = _audit_photos(pictures)
    if is_catalog:
        # En catálogo las fotos principales vienen del catálogo oficial
        photos_score = max(photos_score, 85)
        photos_issues = [i for i in photos_issues if i.get("severity") != "critical"]
    details["photos"] = {"score": photos_score, "count": len(pictures), "catalog_managed": is_catalog}
    issues.extend(photos_issues)
    opportunities.extend(photos_opps)

    # Si es catálogo, informar en oportunidades
    if is_catalog:
        opportunities.append({
            "area": "status",
            "severity": "low",
            "message": "Publicación de Catálogo ML: el título y descripción oficiales son gestionados por Mercado Libre. Para ganar la Buy Box optimizá ficha técnica y precio.",
        })

    # 4. Atributos / Ficha Técnica
    item_attrs = item_data.get("attributes", [])
    attrs_score, attrs_issues, attrs_opps, missing_attrs = _audit_attributes(
        item_attrs, category_attrs
    )
    details["attributes"] = {
        "score": attrs_score,
        "filled": len(item_attrs),
        "required_total": len([a for a in category_attrs if a.get("required", False) or a.get("tags", {}).get("required", False)]),
        "missing": [a.get("name", a.get("id")) for a in missing_attrs[:10]],
    }
    issues.extend(attrs_issues)
    opportunities.extend(attrs_opps)

    # 5. Envío
    shipping = item_data.get("shipping", {})
    ship_score, ship_issues, ship_opps = _audit_shipping(shipping, item_data)
    details["shipping"] = {
        "score": ship_score,
        "free_shipping": shipping.get("free_shipping", False),
    }
    issues.extend(ship_issues)
    opportunities.extend(ship_opps)

    # 6. Video
    video_id = item_data.get("video_id")
    video_score = 100 if video_id else 0
    details["video"] = {"score": video_score, "has_video": bool(video_id)}
    if not video_id:
        opportunities.append({
            "area": "video",
            "severity": "medium",
            "message": "Agregar un video de producto para aumentar la confianza del comprador y mejorar el score",
        })

    # 7. Estado
    status = item_data.get("status", "")
    status_score = 100 if status == "active" else (50 if status == "paused" else 0)
    details["status"] = {"score": status_score, "current": status}
    if status != "active":
        issues.append({
            "area": "status",
            "severity": "high",
            "message": f"La publicación está en estado '{status}' — no es visible para compradores",
        })

    # Score global ponderado
    total_score = 0
    for area, weight in SCORE_WEIGHTS.items():
        area_score = details.get(area, {}).get("score", 0)
        total_score += (area_score * weight) / 100
    total_score = min(100, max(0, round(total_score)))

    # Obtener thumbnail del cache local
    local_product = database.get_product_by_ml_id(ml_id)
    thumbnail = (local_product or {}).get("thumbnail", "") or item_data.get("thumbnail", "")

    result = {
        "ml_id": ml_id,
        "title": title,
        "thumbnail": thumbnail,
        "status": status,
        "catalog_listing": is_catalog,
        "catalog_product_id": item_data.get("catalog_product_id"),
        "sold_quantity": sold_quantity,
        "price": item_data.get("price", 0),
        "score": total_score,
        "issues": issues,
        "opportunities": opportunities,
        "details": details,
        "category_id": category_id,
        "permalink": item_data.get("permalink", ""),
        "audited_at": datetime.now().isoformat(),
    }

    # Guardar auditoría en DB
    database.save_meli_optimization(ml_id, "audit", result)

    return result


def _audit_title(title: str, item_data: dict) -> tuple:
    """Analiza la calidad del título."""
    issues = []
    opps = []
    score = 100

    if not title:
        return 0, [{"area": "title", "severity": "critical", "message": "Sin título"}], []

    # Largo del título
    if len(title) < 20:
        score -= 30
        issues.append({"area": "title", "severity": "high", "message": "Título muy corto — aprovechá los 60 caracteres disponibles"})
    elif len(title) < 40:
        score -= 10
        opps.append({"area": "title", "severity": "low", "message": "El título podría ser más descriptivo y aprovechar más caracteres"})

    # Palabras prohibidas por ML
    forbidden_words = [
        "oferta", "descuento", "promoción", "promo", "envío gratis",
        "cuotas sin interés", "mejor precio", "barato", "!!!", "???",
        "regalo", "gratis", "liquidación", "remate",
    ]
    title_lower = title.lower()
    for word in forbidden_words:
        if word in title_lower:
            score -= 15
            issues.append({
                "area": "title",
                "severity": "high",
                "message": f"El título contiene '{word}' — ML penaliza estas palabras y desperdicían caracteres valiosos",
            })

    # Emojis
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"
        "\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF"
        "]+",
        flags=re.UNICODE,
    )
    if emoji_pattern.search(title):
        score -= 15
        issues.append({"area": "title", "severity": "medium", "message": "El título contiene emojis — ML los penaliza"})

    # Palabras repetidas
    words = title_lower.split()
    seen = set()
    for w in words:
        if len(w) > 3 and w in seen:
            score -= 10
            issues.append({"area": "title", "severity": "medium", "message": f"Palabra repetida en el título: '{w}'"})
            break
        seen.add(w)

    # Mayúsculas excesivas
    upper_count = sum(1 for c in title if c.isupper())
    if len(title) > 5 and upper_count / len(title) > 0.7:
        score -= 10
        opps.append({"area": "title", "severity": "low", "message": "El título tiene demasiadas mayúsculas — ML recomienda formato normal"})

    return max(0, score), issues, opps


def _audit_description(description: str) -> tuple:
    """Analiza la calidad de la descripción."""
    issues = []
    opps = []
    score = 100

    if not description or len(description.strip()) < 10:
        return 0, [{"area": "description", "severity": "critical", "message": "Sin descripción o muy corta — las publicaciones sin descripción tienen mucha menor conversión"}], []

    if len(description) < 100:
        score -= 40
        issues.append({"area": "description", "severity": "high", "message": "Descripción muy breve — debería tener al menos 300 caracteres"})
    elif len(description) < 300:
        score -= 20
        opps.append({"area": "description", "severity": "medium", "message": "La descripción podría ser más completa y detallada"})

    # Verificar que no tenga HTML (ML ya no lo permite)
    if "<" in description and ">" in description:
        if re.search(r'<[a-zA-Z]', description):
            score -= 20
            issues.append({"area": "description", "severity": "high", "message": "La descripción contiene HTML — ML solo acepta texto plano"})

    # Verificar datos de contacto prohibidos
    if re.search(r'@\w+\.\w+', description):
        score -= 20
        issues.append({"area": "description", "severity": "critical", "message": "La descripción contiene un email — ML lo prohíbe y penaliza"})

    url_pattern = re.compile(r'https?://|www\.')
    if url_pattern.search(description):
        score -= 20
        issues.append({"area": "description", "severity": "critical", "message": "La descripción contiene URLs — ML las prohíbe"})

    return max(0, score), issues, opps


def _audit_photos(pictures: list) -> tuple:
    """Analiza la cantidad de fotos."""
    issues = []
    opps = []

    count = len(pictures) if pictures else 0

    if count == 0:
        return 0, [{"area": "photos", "severity": "critical", "message": "Sin fotos — publicación invisible para compradores"}], []

    if count == 1:
        score = 25
        issues.append({"area": "photos", "severity": "high", "message": "Solo 1 foto — agregar al menos 5 fotos para mejorar la conversión (+30% ventas)"})
    elif count < 3:
        score = 45
        opps.append({"area": "photos", "severity": "medium", "message": f"Solo {count} fotos — ML recomienda entre 6 y 10 fotos de calidad"})
    elif count < 6:
        score = 70
        opps.append({"area": "photos", "severity": "low", "message": f"{count} fotos — agregar más para maximizar conversión"})
    else:
        score = 100

    return score, issues, opps


def _audit_attributes(item_attrs: list, category_attrs: list) -> tuple:
    """Compara atributos del item vs requeridos por la categoría."""
    issues = []
    opps = []
    missing = []

    if not category_attrs:
        return 70, [], [{"area": "attributes", "severity": "low", "message": "No se pudieron obtener los atributos de la categoría para verificar completitud"}], []

    # Atributos que el item ya tiene
    filled_ids = set()
    for a in item_attrs:
        aid = a.get("id", "")
        val = a.get("value_name") or a.get("value_id")
        if aid and val and str(val).lower() not in ("", "n/a", "no aplica"):
            filled_ids.add(aid)

    # Atributos requeridos por la categoría
    required_attrs = [
        a for a in category_attrs
        if a.get("tags", {}).get("required", False) or a.get("required", False)
    ]
    recommended_attrs = [
        a for a in category_attrs
        if not (a.get("tags", {}).get("required", False) or a.get("required", False))
        and not a.get("tags", {}).get("read_only", False)
        and a.get("id") not in filled_ids
    ]

    missing_required = [a for a in required_attrs if a.get("id") not in filled_ids]
    missing_recommended = [a for a in recommended_attrs if a.get("id") not in filled_ids]

    missing = missing_required + missing_recommended[:5]

    total_required = len(required_attrs) or 1
    filled_required = total_required - len(missing_required)
    score = round((filled_required / total_required) * 100)

    if missing_required:
        issues.append({
            "area": "attributes",
            "severity": "high",
            "message": f"{len(missing_required)} atributos obligatorios sin completar: {', '.join(a.get('name', a.get('id','?')) for a in missing_required[:5])}",
        })

    if len(missing_recommended) > 3:
        opps.append({
            "area": "attributes",
            "severity": "medium",
            "message": f"{len(missing_recommended)} atributos opcionales sin completar — completar la ficha técnica mejora visibilidad en filtros de búsqueda",
        })

    return max(0, min(100, score)), issues, opps, missing


def _audit_shipping(shipping: dict, item_data: dict) -> tuple:
    """Analiza las condiciones de envío."""
    issues = []
    opps = []

    free = shipping.get("free_shipping", False)
    price = item_data.get("price", 0)

    if free:
        score = 100
    elif price >= 25000:
        score = 30
        opps.append({
            "area": "shipping",
            "severity": "high",
            "message": "Producto de precio alto sin envío gratis — ML prioriza publicaciones con envío gratis en búsquedas",
        })
    else:
        score = 60
        opps.append({
            "area": "shipping",
            "severity": "medium",
            "message": "Ofrecer envío gratis mejora la visibilidad y tasa de conversión",
        })

    return score, issues, opps


# ───────────────────────────────────────────────────────────────────────
# Auditoría masiva
# ───────────────────────────────────────────────────────────────────────

def audit_all_items(status: str = None) -> dict:
    """Audita publicaciones del tenant (opcionalmente filtradas por estado, ej: 'active')."""
    products = database.get_all_products(include_hidden=False)
    ml_products = [p for p in products if p.get("ml_id") and not p["ml_id"].startswith(("LOCAL-", "WEB-"))]
    if status and status != "all":
        ml_products = [p for p in ml_products if p.get("status") == status]

    if not ml_products:
        return {"success": True, "total": 0, "results": [], "avg_score": 0}

    results = []

    def audit_one(product):
        try:
            return audit_single_item(product["ml_id"])
        except Exception as e:
            print(f"[Optimizer] Error auditando {product['ml_id']}: {e}")
            return {
                "ml_id": product["ml_id"],
                "title": product.get("title", ""),
                "score": 0,
                "error": str(e),
                "issues": [],
                "opportunities": [],
            }

    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(audit_one, ml_products))

    scores = [r["score"] for r in results if "error" not in r or r.get("score", 0) > 0]
    avg = round(sum(scores) / len(scores)) if scores else 0

    return {
        "success": True,
        "total": len(results),
        "avg_score": avg,
        "results": results,
        "audited_at": datetime.now().isoformat(),
    }


# ───────────────────────────────────────────────────────────────────────
# Optimización con Gemini AI
# ───────────────────────────────────────────────────────────────────────
# LLM & Robust JSON Parser
# ───────────────────────────────────────────────────────────────────────

def _repair_truncated_json(text: str) -> str:
    """Intenta reparar un JSON truncado a mitad de camino por límite de tokens."""
    s = text.rstrip()
    s = re.sub(r'[,:\s]+$', '', s)

    in_string = False
    escape = False
    open_brackets = []

    for char in s:
        if escape:
            escape = False
            continue
        if char == '\\':
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if not in_string:
            if char in ('{', '['):
                open_brackets.append(char)
            elif char == '}':
                if open_brackets and open_brackets[-1] == '{':
                    open_brackets.pop()
            elif char == ']':
                if open_brackets and open_brackets[-1] == '[':
                    open_brackets.pop()

    if in_string:
        s += '"'

    s = re.sub(r'[,:\s]+$', '', s)

    for bracket in reversed(open_brackets):
        if bracket == '{':
            s += '}'
        elif bracket == '[':
            s += ']'

    return s


def _regex_extract_fields(text: str) -> dict:
    """Extrae campos conocidos mediante regex como último recurso ante JSON malformado."""
    res = {
        "optimized_title": None,
        "optimized_description": None,
        "suggested_attributes": [],
        "manual_suggestions": [],
    }

    # Título
    m_title = re.search(r'"optimized_title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', text)
    if m_title:
        try:
            res["optimized_title"] = m_title.group(1).encode().decode('unicode_escape', 'ignore')
        except Exception:
            res["optimized_title"] = m_title.group(1)

    # Descripción
    m_desc = re.search(r'"optimized_description"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"[a-zA-Z_]+"|\s*"$|\s*"\s*\})', text)
    if m_desc:
        res["optimized_description"] = m_desc.group(1).replace('\\"', '"').replace('\\n', '\n')

    # Atributos sugeridos
    for m_attr in re.finditer(r'\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"value_name"\s*:\s*"([^"]+)"\s*\}', text):
        res["suggested_attributes"].append({
            "id": m_attr.group(1),
            "value_name": m_attr.group(2)
        })

    # Sugerencias manuales
    m_sug = re.search(r'"manual_suggestions"\s*:\s*\[([\s\S]*?)\]', text)
    if m_sug:
        for item in re.finditer(r'"([^"\\]*(?:\\.[^"\\]*)*)"', m_sug.group(1)):
            res["manual_suggestions"].append(item.group(1))

    return res


def _clean_and_parse_json(raw: str) -> dict:
    """Parsea respuestas JSON de Gemini de forma ultra-robusta contra truncamiento y caracteres de control."""
    if not raw or not raw.strip():
        raise ValueError("Respuesta vacía de Gemini AI")

    text = raw.strip()

    # 1. Quitar bloques markdown si existen
    if "```" in text:
        match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if match:
            text = match.group(1).strip()
        else:
            text = re.sub(r'^```(?:json)?\s*', '', text).strip()

    # 2. Localizar el primer '{'
    start_idx = text.find('{')
    if start_idx != -1:
        text = text[start_idx:]

    # 3. Intento directo con strict=False (soporta saltos de línea literales en strings)
    try:
        return json.loads(text, strict=False)
    except Exception:
        pass

    # 4. Limpiar trailing commas
    cleaned = re.sub(r',\s*([\]\}])', r'\1', text)
    try:
        return json.loads(cleaned, strict=False)
    except Exception:
        pass

    # 5. Reparación de JSON truncado por tokens
    repaired = _repair_truncated_json(cleaned)
    try:
        return json.loads(repaired, strict=False)
    except Exception:
        pass

    # 6. Extracción regex como último recurso
    fallback = _regex_extract_fields(text)
    if fallback and (fallback.get("optimized_title") or fallback.get("optimized_description") or fallback.get("suggested_attributes")):
        return fallback

    # Si todo falla, intentar json.loads para generar el error exacto
    return json.loads(text, strict=False)


def _call_gemini(prompt: str, temperature: float = 0.25) -> str:
    """Llama a Gemini AI con fallback de modelos, 8192 tokens y responseMimeType."""
    import requests

    gemini_key = database.get_platform_setting("gemini_api_key", "GEMINI_API_KEY")
    if not gemini_key:
        raise Exception("Se requiere una API Key de Gemini configurada en Ajustes para optimizar publicaciones.")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }
    headers = {"Content-Type": "application/json"}

    for model_name in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=25)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates and candidates[0].get("content", {}).get("parts"):
                    answer = candidates[0]["content"]["parts"][0].get("text", "").strip()
                    if answer:
                        return answer
            elif res.status_code == 400 and "responseMimeType" in (res.text or ""):
                # Fallback sin responseMimeType si un modelo específico no lo acepta
                p2 = dict(payload)
                p2["generationConfig"] = {"temperature": temperature, "maxOutputTokens": 8192}
                res2 = requests.post(url, headers=headers, json=p2, timeout=25)
                if res2.status_code == 200:
                    data2 = res2.json()
                    candidates2 = data2.get("candidates", [])
                    if candidates2 and candidates2[0].get("content", {}).get("parts"):
                        answer2 = candidates2[0]["content"]["parts"][0].get("text", "").strip()
                        if answer2:
                            return answer2
            else:
                print(f"[Optimizer AI] Modelo {model_name} devolvió {res.status_code}: {res.text[:150]}")
        except Exception as e:
            print(f"[Optimizer AI] Excepción con {model_name}: {e}")
            continue

    raise Exception("No se pudo obtener respuesta de Gemini AI con ningún modelo disponible")


def optimize_with_ai(ml_id: str, audit_result: dict = None) -> dict:
    """Genera optimizaciones con IA para una publicación.

    Si no se pasa audit_result, se ejecuta audit_single_item primero.

    Retorna:
      - optimized_title: título optimizado (o None si ya era bueno)
      - optimized_description: descripción optimizada (o None)
      - suggested_attributes: atributos sugeridos (lista de {id, value_name})
      - suggestions: sugerencias textuales para acciones manuales
    """
    if not audit_result:
        audit_result = audit_single_item(ml_id)

    if audit_result.get("error"):
        return {"ml_id": ml_id, "error": audit_result["error"]}

    # Si el score ya es alto, no hace falta optimizar mucho
    score = audit_result.get("score", 0)
    title = audit_result.get("title", "")
    details = audit_result.get("details", {})

    # Obtener datos completos para el prompt
    item_data = meli_api.fetch_item_full_details(ml_id)
    if not item_data:
        return {"ml_id": ml_id, "error": "No se pudieron obtener los datos de la publicación"}

    description = item_data.get("description", "") or ""
    attributes = item_data.get("attributes", [])
    category_id = item_data.get("category_id", "")
    price = item_data.get("price", 0)

    # Obtener atributos de la categoría para saber cuáles faltan
    category_attrs = []
    if category_id:
        category_attrs = database.get_cached_meli_category_attrs(category_id) or []
        if not category_attrs:
            category_attrs = meli_api.fetch_category_attributes(category_id) or []

    # Construir lista de atributos faltantes relevantes
    filled_ids = set()
    attrs_text = []
    for a in attributes:
        aid = a.get("id", "")
        val = a.get("value_name") or a.get("value_id", "")
        if aid and val:
            filled_ids.add(aid)
            attrs_text.append(f"  - {a.get('name', aid)}: {val}")

    missing_attrs_info = []
    for ca in category_attrs:
        ca_id = ca.get("id", "")
        if ca_id not in filled_ids and not ca.get("tags", {}).get("read_only", False):
            is_required = ca.get("tags", {}).get("required", False) or ca.get("required", False)
            values = ca.get("values", [])
            allowed_values = [v.get("name", v.get("id", "")) for v in values[:15]] if values else []
            missing_attrs_info.append({
                "id": ca_id,
                "name": ca.get("name", ca_id),
                "required": is_required,
                "allowed_values": allowed_values,
            })

    attrs_filled_text = "\n".join(attrs_text[:30]) if attrs_text else "(sin atributos cargados)"
    missing_attrs_text = "\n".join(
        f"  - {m['name']} ({'OBLIGATORIO' if m['required'] else 'opcional'})"
        + (f" — Valores permitidos: {', '.join(m['allowed_values'][:8])}" if m['allowed_values'] else "")
        for m in missing_attrs_info[:15]
    ) or "(ninguno)"

    issues_text = "\n".join(f"  - [{i['severity']}] {i['message']}" for i in audit_result.get("issues", []))
    opps_text = "\n".join(f"  - [{o['severity']}] {o['message']}" for o in audit_result.get("opportunities", []))

    is_catalog = bool(audit_result.get("catalog_listing") or item_data.get("catalog_listing"))
    sold_quantity = int(audit_result.get("sold_quantity") or item_data.get("sold_quantity") or 0)

    catalog_instructions = ""
    if is_catalog:
        catalog_instructions = f"""
--- IMPORTANTE: PUBLICACIÓN DE CATÁLOGO MERCADO LIBRE ---
Esta publicación compite en el catálogo oficial de Mercado Libre.
1. El título oficial NO se puede modificar en Mercado Libre (es gestionado por ML): en "optimized_title" devolvé exactamente: "{title}".
2. La descripción oficial NO se puede modificar por API: en "optimized_description" devolvé exactamente la descripción actual o dejala vacía.
3. TU FOCO PRINCIPAL es inferir atributos faltantes para la ficha técnica ("suggested_attributes") con máxima precisión a partir del producto, y dar sugerencias ("manual_suggestions") para ganar la Buy Box (precio competitivo, tiempos de despacho, etc.).
"""
    elif sold_quantity > 0:
        catalog_instructions = f"""
--- NOTA: PUBLICACIÓN CON VENTAS CONCRETADAS ({sold_quantity} vendidas) ---
Mercado Libre prohíbe cambiar el título de publicaciones que ya tienen ventas. En "optimized_title" devolvé exactamente: "{title}". Enfocate en optimizar la descripción y la ficha técnica.
"""

    prompt = f"""Sos un experto en SEO y optimización de publicaciones de Mercado Libre Argentina.
Tu trabajo es optimizar esta publicación para maximizar su visibilidad en búsquedas, tasa de conversión y puntaje de calidad.
{catalog_instructions}
--- PUBLICACIÓN ACTUAL ---
Título actual: {title}
Precio: ${price:,.2f}
Categoría ML: {category_id}
Score de calidad actual: {score}/100

Descripción actual:
{description[:1500] if description else "(sin descripción)"}

Atributos cargados:
{attrs_filled_text}

Atributos FALTANTES (por categoría ML):
{missing_attrs_text}

Problemas detectados:
{issues_text or "(ninguno)"}

Oportunidades de mejora:
{opps_text or "(ninguna)"}

--- INSTRUCCIONES ---

Respondé EXCLUSIVAMENTE en formato JSON válido (sin texto antes ni después, sin markdown), con esta estructura:

{{
  "optimized_title": "Título optimizado (máx 60 chars, formato: Producto + Marca + Modelo + Atributo clave. Sin palabras como oferta, descuento, envío gratis, cuotas. Sin emojis. Sin repetir palabras.)",
  "optimized_description": "Descripción profesional en texto plano (sin HTML). Incluí: qué es el producto, para qué sirve, especificaciones técnicas, beneficios clave, garantía, información de envío. Mínimo 300 caracteres, máximo 1200.",
  "suggested_attributes": [
    {{"id": "BRAND", "value_name": "Valor inferido del producto"}},
    {{"id": "MODEL", "value_name": "Valor inferido"}}
  ],
  "manual_suggestions": [
    "Sugerencia 1 para acciones manuales (fotos, video, precio)"
  ]
}}

REGLAS:
- Si el título actual ya es bueno (score > 80) o es de catálogo/tiene ventas, dejá el mismo título actual.
- Para los atributos sugeridos, solo incluí los que puedas inferir con alta confianza del título y descripción existentes (máximo 8 atributos).
- La descripción debe ser persuasiva pero informativa, sin frases prohibidas por ML.
- Responder SOLO con JSON válido, sin explicaciones adicionales.
"""

    try:
        raw = _call_gemini(prompt, temperature=0.25)
        result = _clean_and_parse_json(raw)

        opt_title = title if (is_catalog or sold_quantity > 0) else result.get("optimized_title", title)
        opt_desc = description if is_catalog else result.get("optimized_description", "")

        # Proyección de calidad tras aplicar cambios
        proj_details = dict(details)
        if opt_title:
            p_title_score, _, _ = _audit_title(opt_title, item_data)
            proj_details["title"] = {"score": p_title_score, "current": opt_title}
        if opt_desc:
            p_desc_score, _, _ = _audit_description(opt_desc)
            proj_details["description"] = {"score": p_desc_score, "current_length": len(opt_desc)}
        elif is_catalog:
            proj_details["description"] = {"score": 100, "current_length": 0, "catalog_managed": True}

        sug_attrs = result.get("suggested_attributes", [])
        if sug_attrs:
            merged_attrs = list(attributes)
            for sa in sug_attrs:
                merged_attrs.append({"id": sa.get("id"), "value_name": sa.get("value_name")})
            p_attrs_score, _, _, _ = _audit_attributes(merged_attrs, category_attrs)
            proj_details["attributes"] = {"score": p_attrs_score, "filled": len(merged_attrs)}

        proj_total_score = 0
        for area, weight in SCORE_WEIGHTS.items():
            area_score = proj_details.get(area, {}).get("score", 0)
            proj_total_score += (area_score * weight) / 100
        proj_score = min(100, max(0, round(proj_total_score)))
        proj_score = max(score, proj_score)

        optimization = {
            "ml_id": ml_id,
            "current_title": title,
            "current_description": description[:500],
            "optimized_title": opt_title,
            "optimized_description": opt_desc,
            "suggested_attributes": result.get("suggested_attributes", []),
            "manual_suggestions": result.get("manual_suggestions", []),
            "score_before": score,
            "projected_score": proj_score,
            "projected_details": proj_details,
            "catalog_listing": is_catalog,
            "has_sales": sold_quantity > 0,
            "status": "pending",
            "generated_at": datetime.now().isoformat(),
            "updated_audit": audit_result,
        }

        # Guardar en DB
        database.save_meli_optimization(ml_id, "optimization", optimization)

        return optimization

    except json.JSONDecodeError as e:
        print(f"[Optimizer AI] Error parseando JSON de Gemini para {ml_id}: {e}")
        return {"ml_id": ml_id, "error": f"Error parseando respuesta de IA: {e}"}
    except Exception as e:
        print(f"[Optimizer AI] Error optimizando {ml_id}: {e}")
        traceback.print_exc()
        return {"ml_id": ml_id, "error": str(e)}


def optimize_all_items(audit_results: list = None, status: str = None, ml_ids: list = None, max_score: int = 80) -> dict:
    """Optimiza publicaciones con IA según filtros (ej: solo activas, IDs específicos, etc.)."""
    if not audit_results:
        cached = database.get_latest_meli_audits()
        if cached:
            audit_results = cached
        else:
            audit_data = audit_all_items()
            audit_results = audit_data.get("results", [])

    products_map = {p["ml_id"]: p.get("status") for p in database.get_all_products(include_hidden=True) if p.get("ml_id")}

    to_optimize = []
    for item in audit_results:
        item_id = item.get("ml_id")
        item_status = products_map.get(item_id) or item.get("status") or "active"
        item["status"] = item_status

        # 1. Si se proveyó una lista explícita de IDs a optimizar
        if ml_ids is not None:
            if item_id in ml_ids:
                to_optimize.append(item)
            continue

        # 2. Si se filtró por estado (ej: 'active')
        if status and status != "all":
            if item_status != status:
                continue

        # 3. Filtrar por score máximo para optimizar
        if item.get("score", 100) < max_score and not item.get("error"):
            to_optimize.append(item)

    # Ordenar por score ascendente (las peores primero)
    to_optimize.sort(key=lambda r: r.get("score", 0))

    results = []
    for item in to_optimize:
        try:
            result = optimize_with_ai(item["ml_id"], audit_result=item)
            results.append(result)
            # Rate limiting para no saturar la API de Gemini
            time.sleep(1.5)
        except Exception as e:
            print(f"[Optimizer] Error optimizando {item.get('ml_id')}: {e}")
            results.append({"ml_id": item.get("ml_id", "?"), "error": str(e)})

    return {
        "success": True,
        "total_audited": len(audit_results),
        "total_optimized": len(results),
        "results": results,
    }


# ───────────────────────────────────────────────────────────────────────
# Aplicación de optimizaciones
# ───────────────────────────────────────────────────────────────────────

def apply_optimization(ml_id: str, optimization: dict = None) -> dict:
    """Aplica las optimizaciones aprobadas a Mercado Libre.

    Si no se pasa optimization, busca la última pendiente en DB.
    """
    if not optimization:
        optimization = database.get_pending_meli_optimization(ml_id)

    if not optimization:
        return {"ml_id": ml_id, "success": False, "error": "No hay optimizaciones pendientes para esta publicación"}

    is_catalog = bool(optimization.get("catalog_listing"))
    has_sales = bool(optimization.get("has_sales"))

    # Si no venían en optimization, consultar datos de la publicación en ML
    if not is_catalog or not has_sales:
        item_data = meli_api.fetch_item_full_details(ml_id)
        if item_data:
            if item_data.get("catalog_listing"):
                is_catalog = True
            if int(item_data.get("sold_quantity") or 0) > 0:
                has_sales = True

    applied = []
    errors = []

    # 1. Aplicar título
    new_title = optimization.get("optimized_title")
    if is_catalog:
        pass  # Título gestionado por catálogo oficial de ML
    elif has_sales and new_title and new_title != optimization.get("current_title"):
        pass  # Publicaciones con ventas no permiten cambio de título en ML
    elif new_title and new_title != optimization.get("current_title"):
        try:
            ok, msg = meli_api.update_item_title(ml_id, new_title)
            if ok:
                applied.append("title")
                try:
                    database.update_product_title(ml_id, new_title)
                except Exception:
                    pass
            else:
                errors.append(f"Título: {msg}")
        except Exception as e:
            errors.append(f"Excepción actualizando título: {e}")

    # 2. Aplicar descripción
    new_desc = optimization.get("optimized_description")
    if is_catalog:
        pass  # Descripción gestionada por catálogo oficial de ML
    elif new_desc and len(new_desc) > 30 and new_desc != optimization.get("current_description"):
        try:
            ok, msg = meli_api.update_item_description(ml_id, new_desc)
            if ok:
                applied.append("description")
                try:
                    database.update_product_description_meli(ml_id, new_desc)
                except Exception:
                    pass
            else:
                errors.append(f"Descripción: {msg}")
        except Exception as e:
            errors.append(f"Excepción actualizando descripción: {e}")

    # 3. Aplicar atributos
    new_attrs = optimization.get("suggested_attributes", [])
    if new_attrs:
        try:
            ok, msg = meli_api.update_item_attributes(ml_id, new_attrs)
            if ok:
                applied.append("attributes")
            else:
                errors.append(f"Atributos: {msg}")
        except Exception as e:
            errors.append(f"Excepción actualizando atributos: {e}")

    # Re-auditar inmediatamente para reflejar nuevo score y datos actualizados
    if applied:
        time.sleep(1.0)
    updated_audit = audit_single_item(ml_id)

    # Actualizar estado en DB
    success = bool(applied) or (is_catalog and not errors)
    status = "applied" if success and not errors else ("partial" if applied else "failed")
    database.update_meli_optimization_status(ml_id, status, applied=applied, errors=errors)

    return {
        "ml_id": ml_id,
        "success": success,
        "applied": applied,
        "errors": errors,
        "status": status,
        "updated_audit": updated_audit,
    }


def apply_all_optimizations() -> dict:
    """Aplica todas las optimizaciones pendientes."""
    pending = database.get_all_pending_meli_optimizations()
    if not pending:
        return {"success": True, "total": 0, "message": "No hay optimizaciones pendientes"}

    results = []
    for opt in pending:
        ml_id = opt.get("ml_id")
        try:
            result = apply_optimization(ml_id, optimization=opt)
            results.append(result)
            time.sleep(0.5)  # Rate limit
        except Exception as e:
            results.append({"ml_id": ml_id, "success": False, "error": str(e)})

    succeeded = sum(1 for r in results if r.get("success"))
    return {
        "success": True,
        "total": len(results),
        "succeeded": succeeded,
        "failed": len(results) - succeeded,
        "results": results,
    }


# ───────────────────────────────────────────────────────────────────────
# Historial
# ───────────────────────────────────────────────────────────────────────

def get_optimization_history(limit: int = 50) -> list:
    """Retorna el historial de optimizaciones."""
    return database.get_meli_optimization_history(limit)
