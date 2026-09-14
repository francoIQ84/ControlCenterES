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

    # 1. Título
    title = item_data.get("title", "")
    title_score, title_issues, title_opps = _audit_title(title, item_data)
    details["title"] = {"score": title_score, "current": title}
    issues.extend(title_issues)
    opportunities.extend(title_opps)

    # 2. Descripción
    description = item_data.get("description", "") or ""
    desc_score, desc_issues, desc_opps = _audit_description(description)
    details["description"] = {"score": desc_score, "current_length": len(description)}
    issues.extend(desc_issues)
    opportunities.extend(desc_opps)

    # 3. Fotos
    pictures = item_data.get("pictures", [])
    photos_score, photos_issues, photos_opps = _audit_photos(pictures)
    details["photos"] = {"score": photos_score, "count": len(pictures)}
    issues.extend(photos_issues)
    opportunities.extend(photos_opps)

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

def audit_all_items() -> dict:
    """Audita todas las publicaciones activas del tenant."""
    products = database.get_all_products(include_hidden=False)
    ml_products = [p for p in products if p.get("ml_id") and not p["ml_id"].startswith(("LOCAL-", "WEB-"))]

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

def _call_gemini(prompt: str, temperature: float = 0.3) -> str:
    """Llama a Gemini AI con fallback de modelos."""
    import requests

    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        raise Exception("Se requiere una API Key de Gemini configurada en Ajustes para optimizar publicaciones.")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 2048,
        },
    }
    headers = {"Content-Type": "application/json"}

    for model_name in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=20)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates and candidates[0].get("content", {}).get("parts"):
                    answer = candidates[0]["content"]["parts"][0].get("text", "").strip()
                    if answer:
                        return answer
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

    prompt = f"""Sos un experto en SEO y optimización de publicaciones de Mercado Libre Argentina.
Tu trabajo es optimizar esta publicación para maximizar su visibilidad en búsquedas, tasa de conversión y puntaje de calidad.

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
  "optimized_description": "Descripción profesional en texto plano (sin HTML). Incluí: qué es el producto, para qué sirve, especificaciones técnicas, beneficios clave, garantía, información de envío. Usá saltos de línea para separar secciones. Mínimo 400 caracteres, máximo 2000.",
  "suggested_attributes": [
    {{"id": "BRAND", "value_name": "Valor inferido del producto"}},
    {{"id": "MODEL", "value_name": "Valor inferido"}}
  ],
  "manual_suggestions": [
    "Sugerencia 1 para acciones que requieren intervención manual (ej: agregar fotos, crear video, etc.)"
  ]
}}

REGLAS:
- Si el título actual ya es bueno (score > 80), dejá el mismo o hacé ajustes mínimos.
- Para los atributos sugeridos, solo incluí los que puedas inferir con alta confianza del título y descripción existentes.
- La descripción debe ser persuasiva pero informativa, sin frases prohibidas por ML.
- Responder SOLO con JSON válido, sin explicaciones adicionales.
"""

    try:
        raw = _call_gemini(prompt, temperature=0.25)

        # Limpiar la respuesta (puede venir con ```json ... ```)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.strip().startswith("```"):
                    in_block = not in_block
                    continue
                json_lines.append(line)
            cleaned = "\n".join(json_lines).strip()

        result = json.loads(cleaned)

        optimization = {
            "ml_id": ml_id,
            "current_title": title,
            "current_description": description[:500],
            "optimized_title": result.get("optimized_title", title),
            "optimized_description": result.get("optimized_description", ""),
            "suggested_attributes": result.get("suggested_attributes", []),
            "manual_suggestions": result.get("manual_suggestions", []),
            "score_before": score,
            "status": "pending",
            "generated_at": datetime.now().isoformat(),
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


def optimize_all_items(audit_results: list = None) -> dict:
    """Optimiza todas las publicaciones con score < 80."""
    if not audit_results:
        audit_data = audit_all_items()
        audit_results = audit_data.get("results", [])

    # Filtrar solo las que necesitan optimización
    to_optimize = [r for r in audit_results if r.get("score", 100) < 80 and not r.get("error")]
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

    applied = []
    errors = []

    # 1. Aplicar título
    new_title = optimization.get("optimized_title")
    if new_title and new_title != optimization.get("current_title"):
        try:
            ok, msg = meli_api.update_item_title(ml_id, new_title)
            if ok:
                applied.append("title")
            else:
                errors.append(f"Error actualizando título: {msg}")
        except Exception as e:
            errors.append(f"Excepción actualizando título: {e}")

    # 2. Aplicar descripción
    new_desc = optimization.get("optimized_description")
    if new_desc and len(new_desc) > 50:
        try:
            ok, msg = meli_api.update_item_description(ml_id, new_desc)
            if ok:
                applied.append("description")
            else:
                errors.append(f"Error actualizando descripción: {msg}")
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
                errors.append(f"Error actualizando atributos: {msg}")
        except Exception as e:
            errors.append(f"Excepción actualizando atributos: {e}")

    # Actualizar estado en DB
    status = "applied" if applied and not errors else ("partial" if applied else "failed")
    database.update_meli_optimization_status(ml_id, status, applied=applied, errors=errors)

    return {
        "ml_id": ml_id,
        "success": bool(applied),
        "applied": applied,
        "errors": errors,
        "status": status,
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
