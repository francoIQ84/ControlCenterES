from fastapi import APIRouter, Depends
from .inventory import router as inventory_router
from .sales import router as sales_router
from .customers import router as customers_router
from .dashboard import router as dashboard_router
from .settings import router as settings_router
from .storefront import router as storefront_router
from .media import router as media_router
from .auth import (router as auth_router, verify_session, require_permission,
                   require_any_permission, require_platform_admin, require_module)
from .tenants import router as tenants_router
from .integrations import router as integrations_router
from .categories import router as categories_router
from .expenses import router as expenses_router
from .backup import router as backup_router
from .whatsapp import router as whatsapp_router
from .mercadopago import router as mercadopago_router
from .blog import router as blog_router
from .inpi import router as inpi_router
from .marketing import router as marketing_router
from .diffusion import router as diffusion_router
from .meli_questions import router as meli_questions_router
from .tiendanube import router as tiendanube_router
from .meli_optimizer import router as meli_optimizer_router
from .listing_optimizer import router as listing_optimizer_router
from .quotes import router as quotes_router
from .platform import router as platform_router

api_router = APIRouter()

# Cada router protegido lleva DOS filtros independientes y se aplican los dos:
#
#   require_permission(...)  -> qué puede hacer esta persona (RBAC)
#   require_module(...)      -> qué contrató este negocio (plan)
#
# Antes el módulo solo escondía la entrada del menú en el frontend, así que
# escribir la URL a mano daba acceso a funcionalidad no contratada. El corte
# real tiene que estar acá.
#
# Los routers que además atienden webhooks públicos (marketing, whatsapp,
# meli/questions) también se pueden gatear a nivel router: esas llamadas
# entran por el dominio apex o por localhost, resuelven al Tenant Maestro —que
# tiene todos los módulos— y pasan sin problema.
#
# `settings` e `integrations` quedan deliberadamente SIN gating de módulo: son
# la puerta por la que un negocio administra su propia cuenta. Apagarlas por
# plan dejaría al cliente sin forma de arreglar su propia configuración.

# Public storefront and auth endpoints
api_router.include_router(storefront_router, prefix="/storefront", tags=["storefront"], dependencies=[Depends(require_module("storefront"))])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])

# Protected admin panel endpoints
api_router.include_router(inventory_router, prefix="/inventory", tags=["inventory"], dependencies=[Depends(verify_session), Depends(require_permission("inventory")), Depends(require_module("inventory"))])
api_router.include_router(sales_router, prefix="/sales", tags=["sales"], dependencies=[Depends(verify_session), Depends(require_permission("sales")), Depends(require_module("sales"))])
api_router.include_router(quotes_router, prefix="/quotes", tags=["quotes"], dependencies=[Depends(verify_session), Depends(require_permission("sales")), Depends(require_module("quotes"))])
api_router.include_router(customers_router, prefix="/customers", tags=["customers"], dependencies=[Depends(verify_session), Depends(require_permission("customers")), Depends(require_module("customers"))])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(verify_session), Depends(require_permission("dashboard")), Depends(require_module("dashboard"))])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"], dependencies=[Depends(verify_session)])
#
# `media` NO lleva gating de módulo aunque exista el módulo "Archivos". El
# módulo controla la página del explorador en el menú; esta API además la usa
# el selector de imágenes de Inventario, Marketing, Blog y Configuración.
# Cortarla por plan dejaría a un cliente Starter sin poder ponerle una foto a
# un producto, que es funcionalidad que sí contrató.
api_router.include_router(media_router, prefix="/media", tags=["media"], dependencies=[Depends(verify_session), Depends(require_any_permission("media", "inventory", "marketing", "blog", "settings"))])
api_router.include_router(categories_router, prefix="/categories", tags=["categories"], dependencies=[Depends(verify_session), Depends(require_permission("inventory")), Depends(require_module("inventory"))])
api_router.include_router(listing_optimizer_router, prefix="/listing-optimizer", tags=["listing-optimizer"], dependencies=[Depends(verify_session), Depends(require_permission("inventory")), Depends(require_module("inventory"))])
api_router.include_router(expenses_router, prefix="/expenses", tags=["expenses"], dependencies=[Depends(verify_session), Depends(require_permission("expenses")), Depends(require_module("expenses"))])
# Multi-tenancy: alta de inquilinos y credenciales de integraciones
api_router.include_router(tenants_router, prefix="/tenants", tags=["tenants"], dependencies=[Depends(verify_session)])
api_router.include_router(integrations_router, prefix="/integrations", tags=["integrations"], dependencies=[Depends(verify_session)])

# Los respaldos vuelcan la base COMPLETA (todos los inquilinos) con pg_dump, así
# que quedan reservados a la administración de la plataforma. Con
# require_permission("settings") el administrador de cualquier tenant cliente
# podría descargarse los datos de todos los demás.
api_router.include_router(backup_router, prefix="/backup", tags=["backup"], dependencies=[Depends(verify_session), Depends(require_platform_admin)])
api_router.include_router(whatsapp_router, prefix="/whatsapp", tags=["whatsapp"], dependencies=[Depends(require_module("whatsapp"))])
api_router.include_router(mercadopago_router, prefix="/mercadopago", tags=["mercadopago"], dependencies=[Depends(verify_session), Depends(require_module("sales"))])
api_router.include_router(blog_router, prefix="/blog", tags=["blog"], dependencies=[Depends(verify_session), Depends(require_permission("settings")), Depends(require_module("blog"))])
api_router.include_router(inpi_router, prefix="/inpi", tags=["inpi"], dependencies=[Depends(verify_session), Depends(require_module("inpi"))])
api_router.include_router(marketing_router, prefix="/marketing", tags=["marketing"], dependencies=[Depends(require_module("marketing"))])
api_router.include_router(diffusion_router, prefix="/diffusion", tags=["diffusion"], dependencies=[Depends(verify_session), Depends(require_module("marketing"))])
api_router.include_router(tiendanube_router, prefix="/tiendanube", tags=["tiendanube"])
api_router.include_router(meli_questions_router, dependencies=[Depends(require_module("customers"))])
api_router.include_router(meli_optimizer_router, tags=["meli-optimizer"], dependencies=[Depends(verify_session), Depends(require_permission("inventory")), Depends(require_module("inventory"))])
api_router.include_router(platform_router, prefix="/platform", tags=["platform"], dependencies=[Depends(verify_session), Depends(require_platform_admin)])
