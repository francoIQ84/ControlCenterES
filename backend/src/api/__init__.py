from fastapi import APIRouter, Depends
from .inventory import router as inventory_router
from .sales import router as sales_router
from .customers import router as customers_router
from .dashboard import router as dashboard_router
from .settings import router as settings_router
from .storefront import router as storefront_router
from .media import router as media_router
from .auth import router as auth_router, verify_session, require_permission, require_platform_admin
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

api_router = APIRouter()

# Public storefront and auth endpoints
api_router.include_router(storefront_router, prefix="/storefront", tags=["storefront"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])

# Protected admin panel endpoints
api_router.include_router(inventory_router, prefix="/inventory", tags=["inventory"], dependencies=[Depends(verify_session), Depends(require_permission("inventory"))])
api_router.include_router(sales_router, prefix="/sales", tags=["sales"], dependencies=[Depends(verify_session), Depends(require_permission("sales"))])
api_router.include_router(customers_router, prefix="/customers", tags=["customers"], dependencies=[Depends(verify_session), Depends(require_permission("customers"))])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(verify_session), Depends(require_permission("dashboard"))])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"], dependencies=[Depends(verify_session)])
api_router.include_router(media_router, prefix="/media", tags=["media"], dependencies=[Depends(verify_session), Depends(require_permission("media"))])
api_router.include_router(categories_router, prefix="/categories", tags=["categories"], dependencies=[Depends(verify_session), Depends(require_permission("inventory"))])
api_router.include_router(expenses_router, prefix="/expenses", tags=["expenses"], dependencies=[Depends(verify_session), Depends(require_permission("expenses"))])
# Multi-tenancy: alta de inquilinos y credenciales de integraciones
api_router.include_router(tenants_router, prefix="/tenants", tags=["tenants"], dependencies=[Depends(verify_session)])
api_router.include_router(integrations_router, prefix="/integrations", tags=["integrations"], dependencies=[Depends(verify_session)])

# Los respaldos vuelcan la base COMPLETA (todos los inquilinos) con pg_dump, así
# que quedan reservados a la administración de la plataforma. Con
# require_permission("settings") el administrador de cualquier tenant cliente
# podría descargarse los datos de todos los demás.
api_router.include_router(backup_router, prefix="/backup", tags=["backup"], dependencies=[Depends(verify_session), Depends(require_platform_admin)])
api_router.include_router(whatsapp_router, prefix="/whatsapp", tags=["whatsapp"])
api_router.include_router(mercadopago_router, prefix="/mercadopago", tags=["mercadopago"], dependencies=[Depends(verify_session)])
api_router.include_router(blog_router, prefix="/blog", tags=["blog"], dependencies=[Depends(verify_session), Depends(require_permission("settings"))])
api_router.include_router(inpi_router, prefix="/inpi", tags=["inpi"], dependencies=[Depends(verify_session)])
api_router.include_router(marketing_router, prefix="/marketing", tags=["marketing"], dependencies=[Depends(verify_session)])
api_router.include_router(diffusion_router, prefix="/diffusion", tags=["diffusion"], dependencies=[Depends(verify_session)])


