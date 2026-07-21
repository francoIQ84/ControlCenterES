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

    gemini_key = database.get_setting("gemini_api_key", "")
    if not gemini_key:
        return {"reply": "Error: API Key de Gemini no configurada en el panel de control."}

    # 1. Gather Catalog Stock Context
    catalog_lines = []
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT ml_id, title, price_web, available_quantity FROM products_cache WHERE available_quantity > 0 AND is_web_active = 1")
            for r in cursor.fetchall():
                catalog_lines.append(f"- {r['title']} (Ref: {r['ml_id']}): ${r['price_web']} - Stock: {r['available_quantity']}")
    catalog_context = "\n".join(catalog_lines)

    # 2. Gather Order Context if Order ID mentioned
    order_context = ""
    order_ids = re.findall(r'\b\d{9,12}\b', req.text)
    if order_ids:
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

    # 3. Retrieve Chat History
    history = database.get_whatsapp_chat_history(req.sender, limit=8)
    
    # 4. Formulate System Prompt
    system_instructions = database.get_setting("whatsapp_bot_instructions", "")
    full_system_prompt = (
        f"{system_instructions}\n\n"
        f"STOCK Y CATÁLOGO DISPONIBLE:\n{catalog_context}\n"
        f"{order_context}"
    )

    # 5. Format Chat Contents for Gemini
    contents = []
    for h in history:
        contents.append({"role": "user", "parts": [{"text": h['message']}]})
        contents.append({"role": "model", "parts": [{"text": h['reply']}]})
    contents.append({"role": "user", "parts": [{"text": req.text}]})

    # 6. Call Gemini API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
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
            
            # Save history
            database.add_whatsapp_chat_message(req.sender, req.text, reply_text)
            
            return {"reply": reply_text}
        else:
            print(f"[Gemini API Error] status={res.status_code}, body={res.text}")
            return {"reply": "Disculpa, he tenido una dificultad al procesar tu respuesta. Por favor intenta de nuevo en unos momentos."}
    except Exception as e:
        print(f"[Gemini Webhook Exception] {e}")
        return {"reply": "Disculpa, ha ocurrido un error interno al conectar con el asistente virtual."}
