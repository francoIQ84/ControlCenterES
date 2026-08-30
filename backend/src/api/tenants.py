"""
API de plataforma: alta y administración de negocios, planes, cobros y suscripciones.

Todo lo que crea o cambia el estado de un tenant exige `require_platform_admin`
(un usuario del Tenant Maestro). El endpoint `/me` describe el propio tenant,
y `/subscription/webhook` atiende avisos de pago de Mercado Pago.
"""

import json
import re
import datetime
import requests
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel, Field, field_validator

from src import database, tenancy, config
from src.api.auth import get_current_user, require_platform_admin

router = APIRouter()

DEFAULT_MODULES = ["dashboard", "inventory", "sales", "customers", "expenses",
                   "media", "settings"]
ALL_MODULES = DEFAULT_MODULES + ["billing", "inpi", "marketing", "whatsapp",
                                 "storefront", "blog"]

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")

DEFAULT_PLAN_PRICES = {
    "starter": 35000.0,
    "pro": 65000.0,
    "enterprise": 190000.0,
    "custom": 50000.0,
    "master": 0.0
}


class TenantCreate(BaseModel):
    slug: str = Field(..., description="Subdominio: {slug}.controlcenter.app")
    name: str
    cuit: Optional[str] = None
    plan_id: str = "starter"
    plan_price: Optional[float] = None
    billing_cycle: Optional[str] = "monthly"
    admin_email: Optional[str] = None
    admin_phone: Optional[str] = None
    next_billing_date: Optional[str] = None
    active_modules: Optional[List[str]] = None
    admin_username: str = "admin"
    admin_password: str = Field(..., min_length=8)
    admin_full_name: str = "Administrador"

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v):
        v = (v or "").strip().lower()
        if not SLUG_RE.match(v):
            raise ValueError(
                "El slug debe tener entre 2 y 63 caracteres: minúsculas, "
                "números y guiones, empezando por letra o número.")
        if v in tenancy.RESERVED_SLUGS:
            raise ValueError(f"'{v}' es un subdominio reservado del sistema.")
        return v

    @field_validator("active_modules")
    @classmethod
    def validate_modules(cls, v):
        if v is None:
            return v
        invalid = [m for m in v if m not in ALL_MODULES]
        if invalid:
            raise ValueError(f"Módulos desconocidos: {', '.join(invalid)}")
        return v


class TenantStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in ("active", "suspended", "trial", "cancelled"):
            raise ValueError("Estado inválido")
        return v


class TenantModulesUpdate(BaseModel):
    active_modules: List[str]

    @field_validator("active_modules")
    @classmethod
    def validate_modules(cls, v):
        invalid = [m for m in v if m not in ALL_MODULES]
        if invalid:
            raise ValueError(f"Módulos desconocidos: {', '.join(invalid)}")
        return v


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    cuit: Optional[str] = None
    plan_id: Optional[str] = None
    plan_price: Optional[float] = None
    billing_cycle: Optional[str] = None
    admin_email: Optional[str] = None
    admin_phone: Optional[str] = None
    next_billing_date: Optional[str] = None
    status: Optional[str] = None
    active_modules: Optional[List[str]] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in ("active", "suspended", "trial", "cancelled"):
            raise ValueError("Estado inválido")
        return v

    @field_validator("active_modules")
    @classmethod
    def validate_modules(cls, v):
        if v is not None:
            invalid = [m for m in v if m not in ALL_MODULES]
            if invalid:
                raise ValueError(f"Módulos desconocidos: {', '.join(invalid)}")
        return v


# ---------------------------------------------------------------------------
# Endpoints de Consulta y Gestión
# ---------------------------------------------------------------------------

@router.get("/me")
def get_my_tenant(current_user: dict = Depends(get_current_user)):
    """Tenant al que pertenece la sesión actual, con sus módulos contratados."""
    tenant = tenancy.get_current_tenant() or tenancy.get_master_tenant()
    tenant_id = tenant["id"]

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT logo_url, primary_color, currency, timezone, active_modules "
                "FROM tenant_settings WHERE tenant_id = %s", (tenant_id,))
            settings_row = cursor.fetchone()

    return {
        "id": tenant_id,
        "slug": tenant.get("slug"),
        "name": tenant.get("name"),
        "status": tenant.get("status"),
        "plan_id": tenant.get("plan_id"),
        "is_master": tenant_id == tenancy.MASTER_TENANT_ID,
        "settings": dict(settings_row) if settings_row else None,
    }


@router.get("/")
def list_tenants(_: dict = Depends(require_platform_admin)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id::text, slug, name, cuit, status, plan_id,
                       admin_email, admin_phone, billing_cycle, plan_price,
                       next_billing_date, last_reminder_sent_at, created_at
                FROM tenants
                ORDER BY created_at DESC
            """)
            rows = [dict(r) for r in cursor.fetchall()]

    for row in rows:
        row["active_modules"] = tenancy.get_active_modules(row["id"])
        # Formatear fecha para JSON
        if row.get("next_billing_date"):
            row["next_billing_date"] = str(row["next_billing_date"])
        if row.get("last_reminder_sent_at"):
            row["last_reminder_sent_at"] = str(row["last_reminder_sent_at"])
    return rows


@router.post("/")
def create_tenant(payload: TenantCreate, _: dict = Depends(require_platform_admin)):
    """Da de alta un negocio con su usuario administrador inicial y configuración de suscripción."""
    modules = payload.active_modules or DEFAULT_MODULES
    price = payload.plan_price if payload.plan_price is not None else DEFAULT_PLAN_PRICES.get(payload.plan_id, 35000.0)
    
    # Fecha de vencimiento: por defecto 30 días de prueba si no se especifica
    next_date = payload.next_billing_date
    if not next_date:
        next_date = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM tenants WHERE slug = %s", (payload.slug,))
            if cursor.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=f"El subdominio '{payload.slug}' ya está en uso")

            cursor.execute("""
                INSERT INTO tenants (
                    slug, name, cuit, status, plan_id,
                    plan_price, billing_cycle, admin_email, admin_phone, next_billing_date
                )
                VALUES (%s, %s, %s, 'trial', %s, %s, %s, %s, %s, %s)
                RETURNING id::text, slug, name, status, plan_id, plan_price, billing_cycle,
                          admin_email, admin_phone, next_billing_date, created_at
            """, (
                payload.slug, payload.name, payload.cuit, payload.plan_id,
                price, payload.billing_cycle or "monthly",
                payload.admin_email, payload.admin_phone, next_date
            ))
            tenant = dict(cursor.fetchone())

    try:
        with tenancy.tenant_context(tenant["id"]):
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO tenant_settings (tenant_id, active_modules)
                        VALUES (%s, %s::jsonb)
                    """, (tenant["id"], json.dumps(modules)))

            database.create_user(
                payload.admin_username,
                payload.admin_password,
                payload.admin_full_name,
                ",".join(modules),
            )
    except Exception as exc:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE tenants SET status = 'cancelled' WHERE id = %s",
                    (tenant["id"],))
        tenancy.invalidate_tenant_cache(payload.slug)
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo completar el alta de '{payload.slug}'; quedó cancelado. Detalle: {exc}")

    tenancy.invalidate_tenant_cache(payload.slug)

    if tenant.get("next_billing_date"):
        tenant["next_billing_date"] = str(tenant["next_billing_date"])

    return {
        "success": True,
        "tenant": tenant,
        "active_modules": modules,
        "admin_username": payload.admin_username,
        "url": f"https://{payload.slug}.controlcenter.app",
        "message": f"Negocio '{payload.name}' creado en estado de prueba (trial).",
    }


@router.patch("/{slug}/status")
def update_tenant_status(slug: str, payload: TenantStatusUpdate,
                         _: dict = Depends(require_platform_admin)):
    if slug == tenancy.MASTER_TENANT_SLUG and payload.status != "active":
        raise HTTPException(
            status_code=400,
            detail="No se puede suspender el Negocio Maestro: es la operación propia.")

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE tenants SET status = %s, updated_at = CURRENT_TIMESTAMP "
                "WHERE slug = %s RETURNING id::text, slug, status",
                (payload.status, slug))
            row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Negocio '{slug}' inexistente")

    tenancy.invalidate_tenant_cache(slug)
    return {"success": True, "tenant": dict(row)}


@router.put("/{slug}")
def update_tenant(slug: str, payload: TenantUpdate, _: dict = Depends(require_platform_admin)):
    """Actualiza los datos del negocio, plan, ciclo de facturación y módulos contratados."""
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id::text, slug, name, cuit, status, plan_id,
                       plan_price, billing_cycle, admin_email, admin_phone, next_billing_date
                FROM tenants WHERE slug = %s
            """, (slug,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Negocio '{slug}' inexistente")
            tenant_id = row["id"]

            if slug == tenancy.MASTER_TENANT_SLUG and payload.status and payload.status != "active":
                raise HTTPException(
                    status_code=400,
                    detail="No se puede suspender el Negocio Maestro: es la operación propia."
                )

            updates = []
            params = []
            if payload.name is not None:
                updates.append("name = %s")
                params.append(payload.name)
            if payload.cuit is not None:
                updates.append("cuit = %s")
                params.append(payload.cuit)
            if payload.plan_id is not None:
                updates.append("plan_id = %s")
                params.append(payload.plan_id)
            if payload.plan_price is not None:
                updates.append("plan_price = %s")
                params.append(payload.plan_price)
            if payload.billing_cycle is not None:
                updates.append("billing_cycle = %s")
                params.append(payload.billing_cycle)
            if payload.admin_email is not None:
                updates.append("admin_email = %s")
                params.append(payload.admin_email)
            if payload.admin_phone is not None:
                updates.append("admin_phone = %s")
                params.append(payload.admin_phone)
            if payload.next_billing_date is not None:
                updates.append("next_billing_date = %s")
                params.append(payload.next_billing_date)
            if payload.status is not None:
                updates.append("status = %s")
                params.append(payload.status)

            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(slug)
                query = f"""
                    UPDATE tenants
                    SET {', '.join(updates)}
                    WHERE slug = %s
                    RETURNING id::text, slug, name, cuit, status, plan_id,
                              plan_price, billing_cycle, admin_email, admin_phone, next_billing_date
                """
                cursor.execute(query, params)
                row = cursor.fetchone()

    # Actualizar tenant_settings (active_modules) si se especificó
    if payload.active_modules is not None:
        with tenancy.tenant_context(tenant_id):
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO tenant_settings (tenant_id, active_modules)
                        VALUES (%s, %s::jsonb)
                        ON CONFLICT (tenant_id) DO UPDATE SET
                            active_modules = EXCLUDED.active_modules,
                            updated_at = CURRENT_TIMESTAMP
                    """, (tenant_id, json.dumps(payload.active_modules)))
        tenancy.invalidate_module_cache(tenant_id)

    tenancy.invalidate_tenant_cache(slug)

    result = dict(row)
    if result.get("next_billing_date"):
        result["next_billing_date"] = str(result["next_billing_date"])
    result["active_modules"] = tenancy.get_active_modules(tenant_id)
    return {"success": True, "tenant": result}


# ---------------------------------------------------------------------------
# Links de Pago de Suscripción (Mercado Pago Checkout Pro)
# ---------------------------------------------------------------------------

@router.post("/{slug}/generate-payment-link")
def generate_payment_link(slug: str, _: dict = Depends(require_platform_admin)):
    """
    Genera un link de pago de Mercado Pago Checkout Pro para renovar la suscripción
    del negocio especificado, utilizando las credenciales de la plataforma (Tenant Maestro).
    """
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id::text, slug, name, plan_id, plan_price, billing_cycle,
                       admin_email, admin_phone, next_billing_date
                FROM tenants WHERE slug = %s
            """, (slug,))
            tenant = cursor.fetchone()

    if not tenant:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    plan_id = tenant.get("plan_id") or "starter"
    cycle = tenant.get("billing_cycle") or "monthly"
    price = float(tenant.get("plan_price") or DEFAULT_PLAN_PRICES.get(plan_id, 35000.0))
    if cycle == "annual" and price == DEFAULT_PLAN_PRICES.get(plan_id, 35000.0):
        # Descuento 2 meses en anual
        price = price * 10

    # Obtener token de Mercado Pago del Tenant Maestro
    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        mp_access_token = config.get_access_token()

    if not mp_access_token:
        # Mock / Demo fallback
        mock_init = f"https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=DEMO-{slug}"
        encoded_url = requests.utils.quote(mock_init, safe="")
        return {
            "success": True,
            "demo_mode": True,
            "init_point": mock_init,
            "qr_code_url": f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={encoded_url}",
            "amount": price,
            "title": f"Suscripción ControlCenterES ({plan_id.upper()} - {cycle})",
            "external_reference": f"sub_{slug}_{plan_id}_{cycle}_{datetime.date.today().isoformat()}"
        }

    period_str = datetime.date.today().strftime("%Y-%m")
    ext_ref = f"sub_{slug}_{plan_id}_{cycle}_{period_str}"
    cycle_label = "Mensual" if cycle == "monthly" else "Anual"
    item_title = f"Suscripción ControlCenterES - Plan {plan_id.capitalize()} ({cycle_label}) - {tenant['name']}"

    headers = {
        "Authorization": f"Bearer {mp_access_token}",
        "Content-Type": "application/json"
    }

    body = {
        "items": [{
            "title": item_title[:256],
            "quantity": 1,
            "currency_id": "ARS",
            "unit_price": price
        }],
        "payer": {
            "name": tenant["name"],
            "email": tenant.get("admin_email") or "cliente@controlcenter.app"
        },
        "external_reference": ext_ref,
        "back_urls": {
            "success": f"https://{slug}.controlcenter.app",
            "failure": f"https://{slug}.controlcenter.app",
            "pending": f"https://{slug}.controlcenter.app"
        },
        "auto_return": "approved",
        "statement_descriptor": "CONTROLCENTER"
    }

    try:
        res = requests.post("https://api.mercadopago.com/checkout/preferences", headers=headers, json=body, timeout=15)
        if res.status_code in [200, 201]:
            data = res.json()
            init_point = data.get("init_point")
            encoded_url = requests.utils.quote(init_point, safe="")
            qr_code_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={encoded_url}"
            return {
                "success": True,
                "preference_id": data.get("id"),
                "init_point": init_point,
                "qr_code_url": qr_code_url,
                "amount": price,
                "title": item_title,
                "external_reference": ext_ref
            }
        else:
            raise HTTPException(status_code=400, detail=f"Error Mercado Pago ({res.status_code}): {res.text}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Excepción al generar preferencia MP: {str(exc)}")


@router.get("/{slug}/payments")
def get_tenant_payments(slug: str, _: dict = Depends(require_platform_admin)):
    """Historial de pagos y renovaciones de suscripción de un negocio."""
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id::text FROM tenants WHERE slug = %s", (slug,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Negocio no encontrado")
            tenant_id = row["id"]

            cursor.execute("""
                SELECT id, mp_payment_id, amount, currency, billing_cycle,
                       period_start, period_end, status, payment_method, created_at
                FROM tenant_subscription_payments
                WHERE tenant_id = %s
                ORDER BY created_at DESC
            """, (tenant_id,))
            payments = [dict(p) for p in cursor.fetchall()]

    for p in payments:
        if p.get("created_at"):
            p["created_at"] = str(p["created_at"])
        if p.get("period_start"):
            p["period_start"] = str(p["period_start"])
        if p.get("period_end"):
            p["period_end"] = str(p["period_end"])

    return {"success": True, "payments": payments}


# ---------------------------------------------------------------------------
# Webhook Receptor de Pagos de Suscripciones (Mercado Pago)
# ---------------------------------------------------------------------------

@router.post("/subscription/webhook")
async def subscription_payment_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Webhook público para notificaciones de pago de Mercado Pago.
    Valida el pago de suscripción, activa el negocio, extiende la fecha de vencimiento
    y despacha las notificaciones automáticas por WhatsApp y Email.
    """
    try:
        params = dict(request.query_params)
        body = {}
        try:
            body = await request.json()
        except Exception:
            pass

        payment_id = params.get("data.id") or params.get("id") or (body.get("data", {}) or {}).get("id") or body.get("id")
        action = params.get("action") or body.get("action") or body.get("type")

        if not payment_id:
            return {"status": "ignored", "reason": "no payment id"}

        # Consultar datos del pago en Mercado Pago usando el token Maestro
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            mp_access_token = config.get_access_token()

        if not mp_access_token:
            return {"status": "ignored", "reason": "master MP token not configured"}

        mp_res = requests.get(
            f"https://api.mercadopago.com/v1/payments/{payment_id}",
            headers={"Authorization": f"Bearer {mp_access_token}"},
            timeout=10
        )

        if mp_res.status_code != 200:
            return {"status": "error", "detail": f"Payment {payment_id} fetch failed ({mp_res.status_code})"}

        p_data = mp_res.json()
        status = p_data.get("status")
        ext_ref = p_data.get("external_reference") or ""

        # Verificar si corresponde a una suscripción de negocio (formato: sub_{slug}_{plan}_{cycle}_{period})
        if status == "approved" and ext_ref.startswith("sub_"):
            parts = ext_ref.split("_")
            if len(parts) >= 4:
                slug = parts[1]
                plan_id = parts[2]
                cycle = parts[3]

                _process_subscription_activation(slug, plan_id, cycle, p_data, background_tasks)
                return {"status": "processed", "slug": slug, "status_applied": "active"}

        return {"status": "ignored", "reason": "not a subscription or not approved"}
    except Exception as err:
        print(f"[Subscription Webhook Error] {err}")
        return {"status": "error", "error": str(err)}


def _process_subscription_activation(slug: str, plan_id: str, cycle: str, p_data: dict, background_tasks: BackgroundTasks):
    """Activa el negocio, suma días al período y despacha confirmaciones."""
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id::text, name, plan_price, next_billing_date, admin_email, admin_phone
                FROM tenants WHERE slug = %s
            """, (slug,))
            tenant = cursor.fetchone()
            if not tenant:
                return

            tenant_id = tenant["id"]
            current_next = tenant.get("next_billing_date")
            base_date = datetime.date.today()
            if current_next and current_next > base_date:
                base_date = current_next

            # Sumar período
            days_to_add = 365 if cycle == "annual" else 30
            new_next_date = base_date + datetime.timedelta(days=days_to_add)

            # Actualizar estado y fecha en tenants
            cursor.execute("""
                UPDATE tenants
                SET status = 'active',
                    plan_id = %s,
                    billing_cycle = %s,
                    next_billing_date = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (plan_id, cycle, new_next_date, tenant_id))

            # Registrar en historial de pagos
            cursor.execute("""
                INSERT INTO tenant_subscription_payments (
                    tenant_id, mp_payment_id, amount, currency, billing_cycle,
                    period_start, period_end, status, payment_method, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'approved', %s, CURRENT_TIMESTAMP)
            """, (
                tenant_id,
                str(p_data.get("id")),
                float(p_data.get("transaction_amount") or 0.0),
                p_data.get("currency_id") or "ARS",
                cycle,
                base_date,
                new_next_date,
                p_data.get("payment_method_id", "mercadopago")
            ))

    tenancy.invalidate_tenant_cache(slug)

    # Despachar avisos de confirmación en segundo plano
    amount_formatted = f"${float(p_data.get('transaction_amount') or 0.0):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    d_str = new_next_date.strftime('%d/%m/%Y')

    # WhatsApp
    admin_phone = tenant.get("admin_phone")
    if admin_phone:
        msg = f"🎉 *¡Pago de Suscripción Confirmado! - ControlCenterES*\n\n" \
              f"Hola *{tenant['name']}*, hemos recibido tu pago de {amount_formatted} con éxito.\n\n" \
              f"✅ *Plan Activo:* {plan_id.upper()} ({cycle.capitalize()})\n" \
              f"📅 *Tu suscripción está renovada hasta el:* {d_str}\n\n" \
              f"¡Gracias por confiar en nosotros para potenciar tu negocio!"
        background_tasks.add_task(_send_whatsapp_notification, admin_phone, msg)

    # Email
    admin_email = tenant.get("admin_email")
    if admin_email:
        subject = f"✅ Suscripción Renovada con Éxito - ControlCenterES ({tenant['name']})"
        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #10b981; margin-top: 0;">¡Pago de Suscripción Acreditado!</h2>
            <p>Hola <strong>{tenant['name']}</strong>,</p>
            <p>Confirmamos la recepción de tu pago por <strong>{amount_formatted}</strong> correspondiente al plan <strong>{plan_id.upper()}</strong>.</p>
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 8px;"><strong>Detalle de la Renovación:</strong></p>
                <ul style="margin: 0; padding-left: 20px; color: #334155;">
                    <li><strong>Comprobante MP:</strong> #{p_data.get('id')}</li>
                    <li><strong>Ciclo:</strong> {cycle.capitalize()}</li>
                    <li><strong>Vigencia hasta:</strong> {d_str}</li>
                </ul>
            </div>
            <p>Tu panel y todas tus sincronizaciones continúan funcionando con normalidad.</p>
            <p style="color: #64748b; font-size: 13px; margin-top: 30px;">Equipo de Soporte de ControlCenterES</p>
        </div>
        """
        background_tasks.add_task(_send_email_notification, admin_email, subject, html_body)


def _send_whatsapp_notification(phone: str, message: str):
    try:
        requests.post("http://127.0.0.1:8091/send-broadcast", json={
            "recipients": [{"phone": phone, "name": "Administrador"}],
            "message": message,
            "delaySeconds": 1
        }, timeout=10)
    except Exception as e:
        print(f"[Subscription WhatsApp Error] {e}")


def _send_email_notification(to_email: str, subject: str, html_body: str):
    try:
        from src.utils.email_sender import send_smtp_email
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            send_smtp_email(to_email, subject, html_body)
    except Exception as e:
        print(f"[Subscription Email Error] {e}")
