import time
import re
import requests
import json
from datetime import datetime

from src import database, config, meli_api

GEMINI_FALLBACK_MODELS = [
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-2.0-flash"
]

def sanitize_and_validate_answer(text: str) -> tuple[str, bool, str]:
    """
    Valida y sanitiza la respuesta antes de enviarla a Mercado Libre para prevenir sanciones.
    Retorna (texto_sanitizado, es_valido, motivo_rechazo)
    """
    if not text or not text.strip():
        return "", False, "Respuesta vacía"

    clean_text = text.strip()

    # Prevenir menciones explícitas de números telefónicos (WhatsApp / Teléfono)
    phone_pattern = re.compile(r'(\+?\d{1,4}[\s-]?)?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}')
    if phone_pattern.search(clean_text) and any(kw in clean_text.lower() for kw in ['whatsapp', 'wsp', 'llamanos', 'contacto', 'celular', 'teléfono', 'telefono']):
        return clean_text, False, "Contiene un número telefónico o WhatsApp no permitido por Mercado Libre"

    # Prevenir correos electrónicos
    email_pattern = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
    if email_pattern.search(clean_text):
        return clean_text, False, "Contiene una dirección de email no permitida por Mercado Libre"

    # Prevenir enlaces web externos
    url_pattern = re.compile(r'https?://[^\s]+|www\.[^\s]+')
    if url_pattern.search(clean_text):
        return clean_text, False, "Contiene un enlace web externo no permitido por Mercado Libre"

    # Truncar si excede el límite de Mercado Libre (2000 caracteres)
    if len(clean_text) > 1950:
        clean_text = clean_text[:1947] + "..."

    return clean_text, True, ""


def generate_ai_answer(question_text: str, item_data: dict, buyer_nickname: str = "", custom_prompt: str = "") -> tuple[str, str]:
    """
    Invoca la API de Gemini AI para redactar la respuesta comercial del producto.
    Retorna (respuesta_generada, modelo_utilizado)
    """
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        # Fallback genérico amable si no hay API key configurada
        stock = item_data.get('available_quantity', 0)
        stock_msg = f"Contamos con {stock} unidades disponibles." if stock > 0 else "En este momento no disponemos de stock."
        fallback_msg = f"¡Hola! Gracias por tu consulta sobre '{item_data.get('title', 'nuestro producto')}'. {stock_msg} ¡Quedamos a tu disposición!"
        return fallback_msg, "system-fallback"

    item_title = item_data.get('title', 'Producto')
    price = item_data.get('price', 0)
    stock = item_data.get('available_quantity', 0)
    status = item_data.get('status', 'active')

    system_instruction = custom_prompt.strip() if custom_prompt else (
        "Sos un vendedor experto, amable y servicial en Mercado Libre Argentina. "
        "Tu objetivo es responder las consultas de potenciales compradores de forma clara, concisa, educada y persuasiva "
        "para concretar la venta. Respetá estrictamente las políticas de Mercado Libre: NUNCA menciones datos de contacto "
        "(teléfono, WhatsApp, e-mail, redes sociales o direcciones web)."
    )

    prompt = f"""
{system_instruction}

--- INFORMACIÓN DEL PRODUCTO ---
Título: {item_title}
Precio: ${price:,.2f}
Stock disponible en inventario: {stock} unidades
Estado de la publicación: {status}

--- CONSULTA DEL COMPRADOR ---
Usuario: {buyer_nickname or 'Comprador'}
Pregunta: "{question_text}"

Escribí una respuesta amable, directa y comercial (máximo 300 caracteres).
    """.strip()

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 350
        }
    }

    headers = {"Content-Type": "application/json"}

    for model_name in GEMINI_FALLBACK_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=12)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get('candidates', [])
                if candidates and candidates[0].get('content', {}).get('parts'):
                    answer = candidates[0]['content']['parts'][0].get('text', '').strip()
                    if answer:
                        return answer, model_name
            else:
                print(f"[Meli Questions AI] Modelo {model_name} devolvió código {res.status_code}: {res.text[:150]}")
        except Exception as e:
            print(f"[Meli Questions AI] Excepción llamando a {model_name}: {e}")
            continue

    # Fallback si falla la llamada a la API de Gemini
    stock_str = f"Tenemos {stock} unidades en stock." if stock > 0 else "Sin stock por el momento."
    return f"¡Hola! Gracias por consultar por {item_title}. {stock_str} ¡Esperamos tu compra!", "offline-fallback"


def process_question(q_raw: dict) -> dict:
    """
    Procesa de principio a fin una pregunta entrante de Mercado Libre.
    """
    start_time = time.time()

    question_id = str(q_raw.get('id') or q_raw.get('question_id'))
    item_id = str(q_raw.get('item_id'))
    question_text = q_raw.get('text') or q_raw.get('question_text') or ""
    buyer_info = q_raw.get('from') or {}
    buyer_id = str(buyer_info.get('id') or q_raw.get('buyer_id') or "")
    buyer_nickname = buyer_info.get('nickname') or q_raw.get('buyer_nickname') or ""

    # Verificar si ya existe en la base de datos
    existing = database.get_meli_question_by_id(question_id)
    if existing and existing.get('status') in ('ANSWERED_AUTO', 'ANSWERED_MANUAL'):
        return existing

    # Buscar datos del producto
    product = None
    try:
        product = database.get_product_by_ml_id(item_id)
    except Exception:
        pass

    if not product:
        # Intentar simulación o fallback básico
        product = {
            "ml_id": item_id,
            "title": q_raw.get('item_title') or f"Producto {item_id}",
            "price": 0.0,
            "available_quantity": 5,
            "status": "active"
        }

    item_title = product.get('title', f"Producto {item_id}")

    # Obtener configuración del auto responder
    auto_enabled = database.get_setting("meli_auto_responder_enabled", "1") == "1"
    mode = database.get_setting("meli_auto_responder_mode", "auto") # "auto" o "draft"
    custom_prompt = database.get_setting("meli_auto_responder_prompt", "")

    # Generar respuesta con Gemini AI
    raw_answer, ai_model = generate_ai_answer(
        question_text=question_text,
        item_data=product,
        buyer_nickname=buyer_nickname,
        custom_prompt=custom_prompt
    )

    # Validar con Guardrails
    clean_answer, is_valid, guardrail_err = sanitize_and_validate_answer(raw_answer)

    elapsed_ms = int((time.time() - start_time) * 1000)

    # Determinar si publicar inmediatamente o dejar como borrador
    status = "PENDING_APPROVAL"
    auto_replied = False
    error_msg = guardrail_err if not is_valid else None

    if auto_enabled and mode == "auto" and is_valid:
        ok_post, msg_post = meli_api.post_question_answer(question_id, clean_answer)
        if ok_post:
            status = "ANSWERED_AUTO"
            auto_replied = True
        else:
            status = "ERROR"
            error_msg = msg_post
    elif not is_valid:
        status = "NEEDS_REVIEW"

    q_data = {
        "question_id": question_id,
        "item_id": item_id,
        "item_title": item_title,
        "buyer_id": buyer_id,
        "buyer_nickname": buyer_nickname,
        "question_text": question_text,
        "answer_text": clean_answer,
        "ai_model_used": ai_model,
        "status": status,
        "auto_replied": auto_replied,
        "response_time_ms": elapsed_ms,
        "error_message": error_msg,
        "answered_at": datetime.now().isoformat() if status.startswith("ANSWERED") else None
    }

    database.create_or_update_meli_question(q_data)
    return q_data


def process_pending_questions() -> list:
    """
    Busca preguntas sin responder en Mercado Libre y las procesa de forma autónoma.
    """
    pending = meli_api.fetch_unanswered_questions(limit=15)
    results = []
    for q in pending:
        try:
            res = process_question(q)
            results.append(res)
        except Exception as e:
            print(f"[Meli Questions Service] Error procesando pregunta {q.get('id')}: {e}")
    return results
