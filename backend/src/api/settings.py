from fastapi import APIRouter, HTTPException, BackgroundTasks, File, UploadFile, Depends
from pydantic import BaseModel
import os
from typing import Optional
from src import database, meli_api, mp_api, config
from src.progress import get_progress, update_progress
from src.api.auth import require_permission

router = APIRouter()

class SetupRequest(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: str
    demo_mode: Optional[bool] = False
    meli_sync_interval: Optional[int] = 30
    meli_msg_purchase: Optional[str] = ""
    meli_msg_shipping: Optional[str] = ""
    meli_msg_pickup: Optional[str] = ""
    meli_msg_invoice: Optional[str] = ""
    meli_enable_manual_msg: Optional[bool] = False
    meli_send_purchase_msg: Optional[bool] = True
    meli_send_shipping_msg: Optional[bool] = True
    meli_send_pickup_msg: Optional[bool] = True
    meli_send_invoice_msg: Optional[bool] = True

class CodeRequest(BaseModel):
    code: str

class SyncAllRequest(BaseModel):
    limit: int = 2000
    date_from: Optional[str] = None

@router.get("/status")
def get_auth_status():
    user_id = config.get_user_id()
    token_valid = meli_api.validate_token()
    
    afip_enabled = database.get_setting('afip_enabled', '0') == '1'
    cert_exists = os.path.exists("backend/data/afip/arca.crt") or os.path.exists("data/afip/arca.crt")
    key_exists = os.path.exists("backend/data/afip/arca.key") or os.path.exists("data/afip/arca.key")
    
    return {
        "is_authenticated": bool(user_id and token_valid),
        "user_id": user_id,
        "demo_mode": meli_api.is_demo_mode(),
        "afip_active": afip_enabled and cert_exists and key_exists
    }

@router.get("/config")
def get_config(_=Depends(require_permission("settings"))):
    try:
        sync_interval = int(database.get_setting('meli_sync_interval', '30'))
    except ValueError:
        sync_interval = 30
        
    return {
        "client_id": database.get_setting('meli_client_id', ''),
        "client_secret": database.get_setting('meli_client_secret', ''),
        "redirect_uri": database.get_setting('meli_redirect_uri', 'https://lvh.me:8090/meli_callback'),
        "demo_mode": database.get_setting('demo_mode', '0') in ('1', 'true'),
        "meli_sync_interval": sync_interval,
        "meli_msg_purchase": database.get_setting('meli_msg_purchase', '¡Hola! Gracias por tu compra. Nos pondremos en contacto a la brevedad para coordinar. ¡Saludos!'),
        "meli_msg_shipping": database.get_setting('meli_msg_shipping', 'Hola, te informamos que tu pedido está en camino. Puedes realizar el seguimiento desde el detalle de tu compra. ¡Gracias por confiar en nosotros!'),
        "meli_msg_pickup": database.get_setting('meli_msg_pickup', '¡Hola! Te informamos que tu paquete ya está disponible y a la espera de ser retirado en el punto de retiro / sucursal seleccionada. Recuerda llevar tu DNI y el código de seguimiento. ¡Muchas gracias por tu compra!'),
        "meli_msg_invoice": database.get_setting('meli_msg_invoice', 'Hola, te informamos que ya adjuntamos tu factura digital a los detalles de tu compra. ¡Saludos!'),
        "meli_enable_manual_msg": database.get_setting('meli_enable_manual_msg', '0') == '1',
        "meli_send_purchase_msg": database.get_setting('meli_send_purchase_msg', '1') == '1',
        "meli_send_shipping_msg": database.get_setting('meli_send_shipping_msg', '1') == '1',
        "meli_send_pickup_msg": database.get_setting('meli_send_pickup_msg', '1') == '1',
        "meli_send_invoice_msg": database.get_setting('meli_send_invoice_msg', '1') == '1'
    }

@router.post("/setup")
def save_setup(req: SetupRequest, _=Depends(require_permission("settings"))):
    # Only clear active session tokens if client_id or client_secret changed
    old_client_id = database.get_setting('meli_client_id', '')
    old_client_secret = database.get_setting('meli_client_secret', '')

    if (req.client_id and req.client_id != old_client_id) or (req.client_secret and req.client_secret != old_client_secret):
        database.delete_setting('meli_access_token')
        database.delete_setting('meli_refresh_token')
        database.delete_setting('meli_user_id')
        database.delete_setting('meli_token_expiry')
    
    database.set_setting('meli_client_id', req.client_id)
    database.set_setting('meli_client_secret', req.client_secret)
    database.set_setting('meli_redirect_uri', req.redirect_uri)
    database.set_setting('demo_mode', '1' if req.demo_mode else '0')
    database.set_setting('meli_sync_interval', str(req.meli_sync_interval or 30))
    database.set_setting('meli_msg_purchase', (req.meli_msg_purchase or '').strip())
    database.set_setting('meli_msg_shipping', (req.meli_msg_shipping or '').strip())
    database.set_setting('meli_msg_pickup', (req.meli_msg_pickup or '').strip())
    database.set_setting('meli_msg_invoice', (req.meli_msg_invoice or '').strip())
    database.set_setting('meli_enable_manual_msg', '1' if req.meli_enable_manual_msg else '0')
    database.set_setting('meli_send_purchase_msg', '1' if req.meli_send_purchase_msg else '0')
    database.set_setting('meli_send_shipping_msg', '1' if req.meli_send_shipping_msg else '0')
    database.set_setting('meli_send_pickup_msg', '1' if req.meli_send_pickup_msg else '0')
    database.set_setting('meli_send_invoice_msg', '1' if req.meli_send_invoice_msg else '0')
    return {"success": True}

class ChannelsUpdateRequest(BaseModel):
    channel_local: Optional[bool] = None
    channel_web: Optional[bool] = None
    channel_meli: Optional[bool] = None
    channel_tiendanube: Optional[bool] = None
    channel_whatsapp: Optional[bool] = None
    channel_arca: Optional[bool] = None

@router.get("/channels")
def get_channels_config():
    """Retorna los canales e integraciones habilitadas en el sistema."""
    return {
        "channel_local": database.get_setting("channel_local", "1") == "1",
        "channel_web": database.get_setting("channel_web", "1") == "1",
        "channel_meli": database.get_setting("channel_meli", "1") == "1",
        "channel_tiendanube": database.get_setting("channel_tiendanube", "1") == "1",
        "channel_whatsapp": database.get_setting("channel_whatsapp", "1") == "1",
        "channel_arca": database.get_setting("channel_arca", "1") == "1",
    }

@router.post("/channels")
def update_channels_config(req: ChannelsUpdateRequest, _=Depends(require_permission("settings"))):
    """Actualiza la activación o desactivación de canales de venta."""
    if req.channel_local is not None:
        database.set_setting("channel_local", "1" if req.channel_local else "0")
    if req.channel_web is not None:
        database.set_setting("channel_web", "1" if req.channel_web else "0")
    if req.channel_meli is not None:
        database.set_setting("channel_meli", "1" if req.channel_meli else "0")
    if req.channel_tiendanube is not None:
        database.set_setting("channel_tiendanube", "1" if req.channel_tiendanube else "0")
    if req.channel_whatsapp is not None:
        database.set_setting("channel_whatsapp", "1" if req.channel_whatsapp else "0")
    if req.channel_arca is not None:
        database.set_setting("channel_arca", "1" if req.channel_arca else "0")
    return {"success": True, "message": "Canales de venta actualizados con éxito."}

@router.post("/exchange-code")
def exchange_code(req: CodeRequest, _=Depends(require_permission("settings"))):
    ok, err = meli_api.authenticate_with_code(req.code)
    if ok:
        return {"success": True}
    else:
        raise HTTPException(status_code=400, detail=err)

@router.post("/logout")
def logout(_=Depends(require_permission("settings"))):
    database.delete_setting('meli_access_token')
    database.delete_setting('meli_refresh_token')
    database.delete_setting('meli_user_id')
    database.clear_all_caches()
    return {"success": True}

class WebConfigModel(BaseModel):
    store_name: str
    logo_url: str
    hero_title: str
    hero_subtitle: str
    hero_image: str
    contact_phone: str
    address: str
    footer_text: str
    favicon_url: Optional[str] = ""

@router.get("/web-config")
def get_web_config(_=Depends(require_permission("settings"))):
    import json
    cfg_str = database.get_setting("web_config")
    if cfg_str:
        try:
            cfg = json.loads(cfg_str)
            if "favicon_url" not in cfg:
                cfg["favicon_url"] = ""
            return cfg
        except Exception:
            pass
    return {
        "store_name": "Tienda Oficial",
        "logo_url": "",
        "hero_title": "Nuestra Tienda Oficial",
        "hero_subtitle": "Los mejores productos directo de fábrica, al mejor precio.",
        "hero_image": "",
        "contact_phone": "",
        "address": "",
        "footer_text": "© 2026 ControlCenterES. Todos los derechos reservados.",
        "favicon_url": ""
    }

@router.post("/web-config")
def save_web_config(req: WebConfigModel, _=Depends(require_permission("settings"))):
    import json
    database.set_setting("web_config", json.dumps(req.dict()))
    return {"success": True}

class CmsConfigModel(BaseModel):
    about_us_enabled: bool = True
    blog_enabled: bool = True
    about_us_title: str = "Sobre Nosotros"
    about_us_content: str = ""
    about_us_images: Optional[str] = ""

@router.get("/cms-config")
def get_cms_config(_=Depends(require_permission("settings"))):
    return {
        "about_us_enabled": database.get_setting("about_us_enabled", "1") == "1",
        "blog_enabled": database.get_setting("blog_enabled", "1") == "1",
        "about_us_title": database.get_setting("about_us_title", "Sobre Nosotros"),
        "about_us_content": database.get_setting("about_us_content", "Somos una empresa especializada en insumos para cultivos tradicionales e hidropónicos en Rosario."),
        "about_us_images": database.get_setting("about_us_images", "")
    }

@router.post("/cms-config")
def save_cms_config(req: CmsConfigModel, _=Depends(require_permission("settings"))):
    database.set_setting("about_us_enabled", "1" if req.about_us_enabled else "0")
    database.set_setting("blog_enabled", "1" if req.blog_enabled else "0")
    database.set_setting("about_us_title", req.about_us_title.strip())
    database.set_setting("about_us_content", req.about_us_content.strip())
    database.set_setting("about_us_images", req.about_us_images.strip() if req.about_us_images else "")
    return {"success": True}

def run_background_sync(limit: int, date_from: Optional[str]):
    try:
        # Step 1: Products Sync
        ok_products, count_or_msg = meli_api.sync_products()
        if not ok_products:
            raise Exception(f"Fallo en la sincronización de productos: {count_or_msg}")
            
        # Step 2: MeLi Sales Sync
        ok_sales, count_or_msg = meli_api.sync_orders(limit=limit, date_from=date_from)
        if not ok_sales:
            raise Exception(f"Fallo en la sincronización de ventas de Mercado Libre: {count_or_msg}")

        # Step 3: Mercado Pago Payments Sync
        ok_mp, count_or_msg = mp_api.sync_mp_payments(date_from=date_from, limit=limit)
        if not ok_mp:
            print(f"[Warning] Sincronización Mercado Pago: {count_or_msg}")
            
        # Finalized successfully
        update_progress(status="completed", progress=100, message="Sincronización histórica (Mercado Libre + Mercado Pago) finalizada exitosamente.")
    except Exception as e:
        update_progress(status="failed", message=str(e))

@router.post("/sync-all")
def trigger_sync_all(req: SyncAllRequest, background_tasks: BackgroundTasks):
    current_status = get_progress().get("status")
    if current_status in ["syncing_products", "syncing_sales"]:
        return {"success": True, "message": "Sincronización ya en curso."}
        
    update_progress(status="idle", progress=0, message="Iniciando...", current=0, total=100)
    background_tasks.add_task(run_background_sync, req.limit, req.date_from)
    return {"success": True, "message": "Sincronización en segundo plano iniciada."}

@router.get("/sync-progress")
def get_sync_progress():
    return get_progress()

class ArcaConfigRequest(BaseModel):
    afip_enabled: bool
    afip_cuit: str
    afip_pto_vta: int
    afip_type_cmp: int
    afip_concept: int
    afip_environment: str
    merchant_name: str
    merchant_address: str
    merchant_phone: str
    merchant_iibb: str = ''
    merchant_iva_condition: str = 'Responsable Monotributo'
    merchant_start_date: str = ''

class CsrRequest(BaseModel):
    cuit: str
    company_name: str

@router.get("/arca-config")
def get_arca_config(_=Depends(require_permission("settings"))):
    cert_exists = os.path.exists("backend/data/afip/arca.crt") or os.path.exists("data/afip/arca.crt")
    key_exists = os.path.exists("backend/data/afip/arca.key") or os.path.exists("data/afip/arca.key")
    return {
        "afip_enabled": database.get_setting('afip_enabled', '0') == '1',
        "afip_cuit": database.get_setting('afip_cuit', ''),
        "afip_pto_vta": int(database.get_setting('afip_pto_vta', '1')),
        "afip_type_cmp": int(database.get_setting('afip_type_cmp', '11')),
        "afip_concept": int(database.get_setting('afip_concept', '1')),
        "afip_environment": database.get_setting('afip_environment', 'homologacion'),
        "merchant_name": database.get_setting('merchant_name', 'Hidroponia Rosario'),
        "merchant_address": database.get_setting('merchant_address', 'Bv. Oroño 4500, Rosario'),
        "merchant_phone": database.get_setting('merchant_phone', '+54 341 456-7890'),
        "merchant_iibb": database.get_setting('merchant_iibb', ''),
        "merchant_iva_condition": database.get_setting('merchant_iva_condition', 'Responsable Monotributo'),
        "merchant_start_date": database.get_setting('merchant_start_date', '01/01/2020'),
        "afip_cert_uploaded": cert_exists,
        "afip_key_generated": key_exists
    }

@router.post("/arca-config")
def save_arca_config(req: ArcaConfigRequest, _=Depends(require_permission("settings"))):
    database.set_setting('afip_enabled', '1' if req.afip_enabled else '0')
    database.set_setting('afip_cuit', req.afip_cuit.strip())
    database.set_setting('afip_pto_vta', str(req.afip_pto_vta))
    database.set_setting('afip_type_cmp', str(req.afip_type_cmp))
    database.set_setting('afip_concept', str(req.afip_concept))
    database.set_setting('afip_environment', req.afip_environment)
    database.set_setting('merchant_name', req.merchant_name.strip())
    database.set_setting('merchant_address', req.merchant_address.strip())
    database.set_setting('merchant_phone', req.merchant_phone.strip())
    database.set_setting('merchant_iibb', req.merchant_iibb.strip())
    database.set_setting('merchant_iva_condition', req.merchant_iva_condition.strip())
    database.set_setting('merchant_start_date', req.merchant_start_date.strip())
    return {"success": True}

@router.post("/arca-generate-csr")
def generate_arca_csr(req: CsrRequest, _=Depends(require_permission("settings"))):
    try:
        from src.utils.afip_ws import generate_csr_and_key
        csr_pem, _ = generate_csr_and_key(req.cuit, req.company_name)
        return {"success": True, "csr": csr_pem}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/arca-upload-cert")
def upload_arca_cert(file: UploadFile = File(...), _=Depends(require_permission("settings"))):
    try:
        os.makedirs("backend/data/afip", exist_ok=True)
        cert_path = "backend/data/afip/arca.crt"
        with open(cert_path, "wb") as f:
            f.write(file.file.read())
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/arca-cuit-lookup")
def arca_cuit_lookup(cuit: str, env: Optional[str] = None):
    try:
        from src.utils.afip_ws import lookup_cuit
        res = lookup_cuit(cuit, env=env)
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Error desconocido al buscar CUIT"))
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Lead Popup & Leads Management ---

class LeadPopupConfigModel(BaseModel):
    enabled: bool = True
    show_on: str = "all"
    title: str = "¿Querés aprender hidroponía?"
    description: str = 'Descargá gratis la guía "Cómo empezar una huerta hidropónica en casa" (PDF de 15 páginas).'
    button_text: str = "Obtener guía gratis"
    pdf_url: str = ""
    delay_seconds: int = 5
    email_subject: str = "🌱 Tu guía gratuita: Cómo empezar una huerta hidropónica en casa"
    email_body: str = "<h2>¡Hola {name}! Gracias por sumarte.</h2><p>Acá tenés tu guía para empezar tu huerta hidropónica en casa:</p>"
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_sender_name: str = "Hidroponia Rosario"

class TestEmailRequest(BaseModel):
    target_email: str

@router.get("/lead-popup")
def get_lead_popup_config(_=Depends(require_permission("settings"))):
    import json
    cfg_str = database.get_setting("lead_popup_config")
    if cfg_str:
        try:
            return json.loads(cfg_str)
        except Exception:
            pass
    return {
        "enabled": database.get_setting("lead_popup_enabled", "1") == "1",
        "show_on": database.get_setting("lead_popup_show_on", "all"),
        "title": database.get_setting("lead_popup_title", "¿Querés aprender hidroponía?"),
        "description": database.get_setting("lead_popup_description", 'Descargá gratis la guía "Cómo empezar una huerta hidropónica en casa" (PDF de 15 páginas).'),
        "button_text": database.get_setting("lead_popup_button_text", "Obtener guía gratis"),
        "pdf_url": database.get_setting("lead_popup_pdf_url", ""),
        "delay_seconds": int(database.get_setting("lead_popup_delay", "5")),
        "email_subject": database.get_setting("lead_email_subject", "🌱 Tu guía gratuita: Cómo empezar una huerta hidropónica en casa"),
        "email_body": database.get_setting("lead_email_body", "<h2>¡Hola {name}! Gracias por sumarte.</h2><p>Acá tenés tu guía para empezar tu huerta hidropónica en casa.</p>"),
        "smtp_host": database.get_setting("smtp_host", "smtp.gmail.com"),
        "smtp_port": int(database.get_setting("smtp_port", "587")),
        "smtp_user": database.get_setting("smtp_user", ""),
        "smtp_password": database.get_setting("smtp_password", ""),
        "smtp_sender_name": database.get_setting("smtp_sender_name", "Hidroponia Rosario")
    }

@router.post("/lead-popup")
def save_lead_popup_config(req: LeadPopupConfigModel, _=Depends(require_permission("settings"))):
    import json
    database.set_setting("lead_popup_config", json.dumps(req.dict()))
    database.set_setting("lead_popup_enabled", "1" if req.enabled else "0")
    database.set_setting("lead_popup_show_on", req.show_on)
    database.set_setting("lead_popup_title", req.title)
    database.set_setting("lead_popup_description", req.description)
    database.set_setting("lead_popup_button_text", req.button_text)
    database.set_setting("lead_popup_pdf_url", req.pdf_url)
    database.set_setting("lead_popup_delay", str(req.delay_seconds))
    database.set_setting("lead_email_subject", req.email_subject)
    database.set_setting("lead_email_body", req.email_body)
    database.set_setting("smtp_host", req.smtp_host)
    database.set_setting("smtp_port", str(req.smtp_port))
    database.set_setting("smtp_user", req.smtp_user)
    database.set_setting("smtp_password", req.smtp_password)
    database.set_setting("smtp_sender_name", req.smtp_sender_name)
    return {"success": True, "message": "Configuración del Pop-up y SMTP guardada correctamente"}

@router.post("/test-email")
def send_test_email(req: TestEmailRequest, _=Depends(require_permission("settings"))):
    from src.utils.email_sender import send_smtp_email
    subject = "Prueba de envío SMTP - ControlCenterES"
    html_content = "<p>¡Hola! Esta es una prueba de envío automático desde tu configuración SMTP en ControlCenterES.</p>"
    pdf_url = database.get_setting("lead_popup_pdf_url", "")
    
    ok, msg = send_smtp_email(req.target_email, subject, html_content, pdf_url=pdf_url)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": "Email de prueba enviado exitosamente"}

@router.get("/leads")
def get_leads(_=Depends(require_permission("settings"))):
    return database.get_all_leads()

@router.delete("/leads/{lead_id}")
def delete_lead_endpoint(lead_id: int, _=Depends(require_permission("settings"))):
    database.delete_lead(lead_id)
    return {"success": True}

@router.get("/leads/export")
def export_leads_csv(_=Depends(require_permission("settings"))):
    from fastapi.responses import Response
    import csv
    import io

    leads = database.get_all_leads()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Nombre", "Email", "Pais", "Origen", "PDF Enviado", "Fecha Registro"])

    for l in leads:
        writer.writerow([
            l.get("id"),
            l.get("name", ""),
            l.get("email", ""),
            l.get("country", ""),
            l.get("source", ""),
            l.get("pdf_sent", ""),
            str(l.get("created_at", ""))
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_contactos.csv"}
    )

