from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from src import database
from src.api.auth import verify_session, require_permission
import requests
import re

router = APIRouter()

class WhatsAppConfigReq(BaseModel):
    enabled: bool
    gemini_api_key: str
    bot_instructions: str

class TestKeyReq(BaseModel):
    gemini_api_key: str

class StatusUpdateReq(BaseModel):
    status: str
    phone: Optional[str] = ""
    qr: Optional[str] = ""

class WebhookReq(BaseModel):
    sender: str
    text: str

def verify_internal_only(request: Request):
    # Allow local connections only
    client_host = request.client.host
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Access denied: Internal only")

# Admin panel endpoints (Protected)
@router.get("/config")
def get_whatsapp_config(_=Depends(verify_session)):
    return {
        "enabled": database.get_setting("whatsapp_enabled", "0") == "1",
        "gemini_api_key": database.get_setting("gemini_api_key", ""),
        "bot_instructions": database.get_setting("whatsapp_bot_instructions", (
            "Eres un asistente virtual experto y amable para la tienda 'Hidroponia Rosario'. "
            "Responde de forma concisa y educada. Ayuda a los clientes con información de stock, "
            "precios, envíos o con el estado de sus pedidos. "
            "Responde siempre en español."
        )),
        "status": database.get_setting("whatsapp_status", "disconnected"),
        "phone": database.get_setting("whatsapp_phone", ""),
        "qr": database.get_setting("whatsapp_qr", "")
    }

@router.post("/config")
def save_whatsapp_config(req: WhatsAppConfigReq, _=Depends(verify_session), _2=Depends(require_permission("settings"))):
    database.set_setting("whatsapp_enabled", "1" if req.enabled else "0")
    database.set_setting("gemini_api_key", req.gemini_api_key.strip())
    database.set_setting("whatsapp_bot_instructions", req.bot_instructions.strip())
    return {"success": True}

@router.post("/test-key")
def test_gemini_key(req: TestKeyReq, _=Depends(verify_session)):
    key = req.gemini_api_key.strip()
    if not key:
        return {"success": False, "error": "Debes ingresar una API Key de Gemini."}
    
    models = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-2.0-flash"]
    first_error = ""
    for model_name in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": "Hola, prueba de conexion."}]}]
        }
        try:
            res = requests.post(url, json=payload, timeout=10)
            if res.status_code == 200:
                return {"success": True, "message": f"Conexión exitosa con el modelo {model_name}!"}
            else:
                try:
                    err_json = res.json()
                    err_data = err_json.get('error', {})
                    msg = err_data.get('message', res.text)
                except Exception:
                    err_data = {}
                    msg = res.text
                
                if not first_error:
                    first_error = msg
                    
                if "API_KEY_INVALID" in str(err_data) or "API key not valid" in msg:
                    return {"success": False, "error": "La API Key ingresada no es válida. Revisa haberla copiado correctamente desde Google AI Studio."}
                    
                if "no longer available" in msg or "not found" in msg.lower() or res.status_code in (404, 429, 500, 502, 503, 504):
                    continue
                else:
                    return {"success": False, "error": f"Error ({res.status_code}): {msg}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
            
    if "RESOURCE_EXHAUSTED" in first_error or "Quota" in first_error:
        return {"success": False, "error": "Se ha alcanzado el límite de consultas (cuota) de esta API Key en Google AI Studio."}

    return {"success": False, "error": f"No se pudo conectar con los modelos de Gemini ({first_error})."}

@router.get("/inquiries/summary")
def get_inquiries_summary(_=Depends(verify_session)):
    return database.get_whatsapp_inquiries_summary()

@router.get("/inquiries/list")
def get_inquiries_list(limit: int = 50, _=Depends(verify_session)):
    return database.get_whatsapp_inquiries_list(limit)

# Internal service endpoints (Only from localhost)
@router.post("/status-update")
def status_update(req: StatusUpdateReq, _=Depends(verify_internal_only)):
    database.set_setting("whatsapp_status", req.status)
    database.set_setting("whatsapp_phone", req.phone or "")
    database.set_setting("whatsapp_qr", req.qr or "")
    return {"success": True}

@router.post("/webhook")
def whatsapp_webhook(req: WebhookReq, _=Depends(verify_internal_only)):
    enabled = database.get_setting("whatsapp_enabled", "0") == "1"
    if not enabled:
        return {"reply": None}

    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        return {"reply": "Error: API Key de Gemini no configurada en el panel de control."}

    user_text = (req.text or "").strip()
    if not user_text:
        return {"reply": None}

    # 1. Gather Catalog Stock Context
    catalog_lines = []
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT ml_id, title, price_web, available_quantity FROM products_cache WHERE available_quantity > 0 AND is_web_active = 1")
                for r in cursor.fetchall():
                    catalog_lines.append(f"- {r['title']} (Ref: {r['ml_id']}): ${r['price_web']} - Stock: {r['available_quantity']}")
    except Exception as e:
        print(f"[Catalog Context Error] {e}")
    catalog_context = "\n".join(catalog_lines)

    # 2. Gather Order Context if Order ID mentioned
    order_context = ""
    order_ids = re.findall(r'\b\d{9,12}\b', user_text)
    if order_ids:
        try:
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT order_id, date_created, total_amount, status, shipping_status 
                        FROM orders_cache 
                        WHERE order_id = %s
                    """, (int(order_ids[0]),))
                    row = cursor.fetchone()
                    if row:
                        order_context = (
                            f"\n[INFORMACIÓN DE PEDIDO ENCONTRADO EN BASE DE DATOS: "
                            f"Pedido #{row['order_id']}, Fecha: {row['date_created']}, "
                            f"Monto Total: ${row['total_amount']}, Pago: {row['status']}, "
                            f"Entrega: {row['shipping_status']}]"
                        )
        except Exception as e:
            print(f"[Order Context Error] {e}")

    # 3. Retrieve Chat History
    history = database.get_whatsapp_chat_history(req.sender, limit=8)
    
    # 4. Formulate System Prompt
    system_instructions = database.get_setting("whatsapp_bot_instructions", "")
    inquiry_instructions = (
        "\n\nREGLA IMPORTANTE DE REGISTRO DE PRODUCTOS:\n"
        "Si el cliente consulta o muestra interés por uno o varios productos o artículos (ya sea que estén en stock o no, o que no figuren en el catálogo), agrega al final de tu respuesta una o varias líneas con el siguiente formato exacto:\n"
        "[INQUIRY: Nombre del Producto | IN_STOCK: true/false]\n"
        "Usa true si el producto existe en el catálogo disponible y tiene stock > 0, o false si está agotado o no figura en el catálogo."
    )
    full_system_prompt = (
        f"{system_instructions}\n\n"
        f"STOCK Y CATÁLOGO DISPONIBLE:\n{catalog_context}\n"
        f"{order_context}"
        f"{inquiry_instructions}"
    )

    # 5. Format Chat Contents for Gemini (ensuring alternating user/model turns and no empty texts)
    contents = []
    for h in history:
        msg = (h.get('message') or '').strip()
        reply = (h.get('reply') or '').strip()
        if msg and reply and not reply.startswith("Disculpa, he tenido") and not reply.startswith("Error:"):
            contents.append({"role": "user", "parts": [{"text": msg}]})
            contents.append({"role": "model", "parts": [{"text": reply}]})
            
    contents.append({"role": "user", "parts": [{"text": user_text}]})

    # 6. Call Gemini API with Fallback Models
    models_to_try = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-2.0-flash"]
    last_error_msg = ""

    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": full_system_prompt}]
            }
        }

        try:
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            if res.status_code == 200:
                res_data = res.json()
                reply_text = res_data['candidates'][0]['content']['parts'][0]['text']
                
                # Parse and extract product inquiries
                inquiries = re.findall(r'\[INQUIRY:\s*(.*?)\s*\|\s*IN_STOCK:\s*(true|false)\]', reply_text, re.IGNORECASE)
                for prod_name, is_stock in inquiries:
                    if prod_name:
                        in_stock_bool = is_stock.lower() == 'true'
                        database.add_whatsapp_inquiry(req.sender, prod_name.strip(), in_stock_bool)

                # Clean tag lines before sending reply to user
                clean_reply_text = re.sub(r'\[INQUIRY:\s*.*?\s*\|\s*IN_STOCK:\s*(?:true|false)\]', '', reply_text, flags=re.IGNORECASE).strip()

                # Save history
                database.add_whatsapp_chat_message(req.sender, user_text, clean_reply_text)
                return {"reply": clean_reply_text}
            else:
                try:
                    err_json = res.json()
                    err_msg = err_json.get('error', {}).get('message', res.text)
                except Exception:
                    err_msg = res.text
                print(f"[Gemini API Error - {model_name}] status={res.status_code}, body={err_msg}")
                last_error_msg = err_msg
                # Continue attempting next model if model not available/deprecated, quota (429), or server error
                if "no longer available" in err_msg or "not found" in err_msg.lower() or res.status_code in (404, 429, 500, 502, 503, 504):
                    continue
                else:
                    break
        except Exception as e:
            print(f"[Gemini Webhook Exception - {model_name}] {e}")
            last_error_msg = str(e)

    # Log detailed error for admin/console debugging
    print(f"[Gemini Webhook Final Error] Sender: {req.sender}, Last Error: {last_error_msg}")

    # Return polite, professional fallback message to WhatsApp customer
    return {"reply": "Disculpa la demora, en este momento nuestros asesores están ocupados. Por favor déjanos tu consulta y un representante se pondrá en contacto contigo a la brevedad."}
