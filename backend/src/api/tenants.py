"""
API de plataforma: alta y administración de inquilinos.

Todo lo que crea o cambia el estado de un tenant exige `require_platform_admin`
(un usuario del Tenant Maestro). El único endpoint abierto a cualquier usuario
autenticado es `/me`, que describe su propio tenant.
"""

import json
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from src import database, tenancy
from src.api.auth import get_current_user, require_platform_admin

router = APIRouter()

DEFAULT_MODULES = ["dashboard", "inventory", "sales", "customers", "expenses",
                   "media", "settings"]
ALL_MODULES = DEFAULT_MODULES + ["billing", "inpi", "marketing", "whatsapp",
                                 "storefront", "blog"]

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


class TenantCreate(BaseModel):
    slug: str = Field(..., description="Subdominio: {slug}.controlcenter.app")
    name: str
    cuit: Optional[str] = None
    plan_id: str = "starter"
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


# ---------------------------------------------------------------------------

@router.get("/me")
def get_my_tenant(current_user: dict = Depends(get_current_user)):
    """Tenant al que pertenece la sesión actual, con sus módulos contratados.

    El panel lo usa para pintar el logo y los colores del cliente y para
    ocultar las secciones que no tiene contratadas.
    """
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
                SELECT id::text, slug, name, cuit, status, plan_id, created_at
                FROM tenants
                ORDER BY created_at
            """)
            rows = [dict(r) for r in cursor.fetchall()]

    # Los módulos NO se traen con un JOIN a tenant_settings: esa tabla lleva
    # RLS, así que desde el contexto del Tenant Maestro el join devolvería NULL
    # para todos los demás. Se consulta cada uno bajo su propio contexto.
    for row in rows:
        row["active_modules"] = tenancy.get_active_modules(row["id"])
    return rows


@router.post("/")
def create_tenant(payload: TenantCreate, _: dict = Depends(require_platform_admin)):
    """Da de alta un inquilino con su usuario administrador inicial.

    El usuario se crea dentro del contexto del tenant nuevo, así que RLS lo
    ancla a él: no hay forma de que termine colgado del Tenant Maestro.
    """
    modules = payload.active_modules or DEFAULT_MODULES

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM tenants WHERE slug = %s", (payload.slug,))
            if cursor.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=f"El subdominio '{payload.slug}' ya está en uso")

            cursor.execute("""
                INSERT INTO tenants (slug, name, cuit, status, plan_id)
                VALUES (%s, %s, %s, 'trial', %s)
                RETURNING id::text, slug, name, status, plan_id, created_at
            """, (payload.slug, payload.name, payload.cuit, payload.plan_id))
            tenant = dict(cursor.fetchone())

    # `tenant_settings` y `users` llevan RLS, así que sus filas solo pueden
    # escribirse desde el contexto del inquilino al que pertenecen: hacerlo
    # todavía como Tenant Maestro lo rechaza la propia política WITH CHECK.
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
        # El alta en `tenants` ya está confirmada (autocommit). Si la
        # configuración inicial falla, se deja el inquilino cancelado en lugar
        # de dejarlo a medio crear y accesible.
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE tenants SET status = 'cancelled' WHERE id = %s",
                    (tenant["id"],))
        tenancy.invalidate_tenant_cache(payload.slug)
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo completar el alta de '{payload.slug}'; quedó "
                   f"cancelado. Detalle: {exc}")

    tenancy.invalidate_tenant_cache(payload.slug)

    return {
        "success": True,
        "tenant": tenant,
        "active_modules": modules,
        "admin_username": payload.admin_username,
        "url": f"https://{payload.slug}.controlcenter.app",
        "message": f"Tenant '{payload.name}' creado en estado de prueba (trial).",
    }


@router.patch("/{slug}/status")
def update_tenant_status(slug: str, payload: TenantStatusUpdate,
                         _: dict = Depends(require_platform_admin)):
    if slug == tenancy.MASTER_TENANT_SLUG and payload.status != "active":
        raise HTTPException(
            status_code=400,
            detail="No se puede suspender el Tenant Maestro: es la operación propia.")

    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE tenants SET status = %s, updated_at = CURRENT_TIMESTAMP "
                "WHERE slug = %s RETURNING id::text, slug, status",
                (payload.status, slug))
            row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Tenant '{slug}' inexistente")

    tenancy.invalidate_tenant_cache(slug)
    return {"success": True, "tenant": dict(row)}


@router.patch("/{slug}/modules")
def update_tenant_modules(slug: str, payload: TenantModulesUpdate,
                          _: dict = Depends(require_platform_admin)):
    """Cambia los módulos contratados (alta/baja de plan)."""
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id::text FROM tenants WHERE slug = %s", (slug,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404,
                                    detail=f"Tenant '{slug}' inexistente")
            tenant_id = row["id"]

    # tenant_settings lleva RLS: hay que escribir desde el contexto del dueño.
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

    tenancy.invalidate_tenant_cache(slug)
    tenancy.invalidate_module_cache(tenant_id)
    return {"success": True, "active_modules": payload.active_modules}
