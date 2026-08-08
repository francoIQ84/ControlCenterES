from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import json
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

from src import database
from src.api.auth import verify_session

router = APIRouter()

class GroupCreateReq(BaseModel):
    name: str
    description: Optional[str] = ""
    channel_type: Optional[str] = "both" # 'whatsapp', 'email', 'both'
    criteria_json: Optional[dict] = {}

class MemberAddReq(BaseModel):
    members: List[dict] # list of {customer_id, contact_name, phone, email, source}

class SendCampaignReq(BaseModel):
    title: str
    group_id: int
    channel: str # 'whatsapp', 'email', 'both'
    message_text: str
    media_url: Optional[str] = ""
    post_id: Optional[int] = None
    delay_seconds: Optional[int] = 5

class TestEmailReq(BaseModel):
    to_email: str
    subject: Optional[str] = "Prueba de Email Marketing - ControlCenterES"
    message_text: Optional[str] = "Este es un correo de prueba de difusión publicitaria."
    media_url: Optional[str] = ""

@router.get("/groups")
def get_groups(_=Depends(verify_session)):
    try:
        groups = database.get_diffusion_groups()
        return {"status": "success", "groups": groups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/groups")
def create_group(req: GroupCreateReq, _=Depends(verify_session)):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="El nombre del grupo es obligatorio")
    try:
        group_id = database.create_diffusion_group(req.dict())
        return {"status": "success", "group_id": group_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/groups/{group_id}")
def delete_group(group_id: int, _=Depends(verify_session)):
    try:
        database.delete_diffusion_group(group_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/groups/{group_id}/members")
def get_group_members(group_id: int, _=Depends(verify_session)):
    try:
        members = database.get_group_members(group_id)
        return {"status": "success", "members": members}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/groups/{group_id}/members")
def add_group_members(group_id: int, req: MemberAddReq, _=Depends(verify_session)):
    try:
        added_count = database.add_group_members(group_id, req.members)
        return {"status": "success", "added_count": added_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/groups/{group_id}/members/{member_id}")
def delete_member(group_id: int, member_id: int, _=Depends(verify_session)):
    try:
        database.delete_group_member(member_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/crm-contacts")
def get_crm_contacts(_=Depends(verify_session)):
    try:
        customers = database.get_all_customers()
        return {"status": "success", "contacts": customers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Helper to send email with HTML Card template
def send_html_email(to_email: str, subject: str, message_text: str, media_url: str = ""):
    smtp_host = database.get_setting("smtp_host", "").strip()
    smtp_port = int(database.get_setting("smtp_port", "587"))
    smtp_user = database.get_setting("smtp_user", "").strip()
    smtp_pass = database.get_setting("smtp_pass", "").strip() or database.get_setting("smtp_password", "").strip()
    sender_name = database.get_setting("smtp_sender_name", "Hidroponía Rosario").strip()

    if not smtp_host or not smtp_user or not smtp_pass:
        raise Exception("Servidor SMTP no configurado. Ve a Ajustes > Ajustes de Pop-up & Email Marketing SMTP para ingresarlo.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{smtp_user}>"
    msg["To"] = to_email

    # Plain text version
    text_content = f"{message_text}\n\n"
    if media_url:
        text_content += f"Ver imagen: {media_url}\n\n"
    text_content += f"Enviado por {sender_name}"

    # HTML Card version
    media_html = f'<div style="text-align: center; margin-bottom: 20px;"><img src="{media_url}" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" alt="Publicidad"/></div>' if media_url else ''
    
    formatted_body = message_text.replace('\n', '<br>')

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #1e293b; }}
            .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }}
            .header {{ background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 24px; text-align: center; font-size: 22px; font-weight: bold; }}
            .content {{ padding: 28px; line-height: 1.6; font-size: 16px; color: #334155; }}
            .footer {{ background: #f8fafc; padding: 18px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; }}
            .btn {{ display: inline-block; background: #10b981; color: white !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 15px; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                🌿 {sender_name} — Novedades & Ofertas
            </div>
            <div class="content">
                {media_html}
                <div style="font-size: 16px; color: #1e293b;">
                    {formatted_body}
                </div>
            </div>
            <div class="footer">
                Recibiste este correo porque formás parte de nuestra lista de clientes.<br>
                <strong>{sender_name}</strong>
            </div>
        </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, to_email, msg.as_string())

@router.post("/test-email")
def test_email(req: TestEmailReq, _=Depends(verify_session)):
    try:
        send_html_email(req.to_email, req.subject, req.message_text, req.media_url)
        return {"status": "success", "message": f"Correo de prueba enviado a {req.to_email}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def run_campaign_background(campaign_id: int, delay_seconds: int):
    campaign = database.get_diffusion_campaign_by_id(campaign_id)
    if not campaign:
        return
    
    group_id = campaign.get('group_id')
    members = database.get_group_members(group_id) if group_id else []
    channel = campaign.get('channel', 'whatsapp')
    message_text = campaign.get('message_text', '')
    media_url = campaign.get('media_url', '')
    
    sent_count = 0
    failed_count = 0
    logs = []

    # If WhatsApp channel enabled, format data for Node Baileys broadcast endpoint
    if channel in ('whatsapp', 'both'):
        wa_members = [m for m in members if m.get('phone')]
        if wa_members:
            try:
                res = requests.post("http://127.0.0.1:8091/send-broadcast", json={
                    "recipients": [{"phone": m['phone'], "name": m.get('contact_name')} for m in wa_members],
                    "message": message_text,
                    "mediaUrl": media_url,
                    "delaySeconds": delay_seconds
                }, timeout=15)
                if res.status_code == 200:
                    rjson = res.json()
                    sent_count += rjson.get('sent_count', 0)
                    failed_count += rjson.get('failed_count', 0)
                    logs.append(f"WhatsApp: {rjson.get('sent_count', 0)} enviados, {rjson.get('failed_count', 0)} fallidos.")
                else:
                    failed_count += len(wa_members)
                    logs.append(f"Error en servidor WhatsApp: {res.text}")
            except Exception as e:
                failed_count += len(wa_members)
                logs.append(f"Error de conexión con WhatsApp: {str(e)}")

    # If Email channel enabled
    if channel in ('email', 'both'):
        email_members = [m for m in members if m.get('email')]
        for m in email_members:
            try:
                send_html_email(m['email'], campaign.get('title', 'Novedades de la Tienda'), message_text, media_url)
                sent_count += 1
                logs.append(f"Email enviado a {m['email']}")
            except Exception as e:
                failed_count += 1
                logs.append(f"Error enviando email a {m['email']}: {str(e)}")

    database.update_diffusion_campaign(campaign_id, {
        "status": "completed" if failed_count == 0 else "completed_with_errors",
        "sent_count": sent_count,
        "failed_count": failed_count,
        "logs_json": logs,
        "completed": True
    })

@router.post("/send")
def start_campaign(req: SendCampaignReq, background_tasks: BackgroundTasks, _=Depends(verify_session)):
    members = database.get_group_members(req.group_id)
    if not members:
        raise HTTPException(status_code=400, detail="El grupo seleccionado no tiene miembros.")

    campaign_id = database.create_diffusion_campaign({
        "title": req.title,
        "channel": req.channel,
        "group_id": req.group_id,
        "post_id": req.post_id,
        "message_text": req.message_text,
        "media_url": req.media_url,
        "total_targets": len(members)
    })

    background_tasks.add_task(run_campaign_background, campaign_id, req.delay_seconds)
    return {"status": "success", "campaign_id": campaign_id, "message": "Campaña de difusión iniciada en segundo plano."}

@router.get("/campaigns")
def get_campaigns(_=Depends(verify_session)):
    try:
        campaigns = database.get_diffusion_campaigns()
        return {"status": "success", "campaigns": campaigns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
