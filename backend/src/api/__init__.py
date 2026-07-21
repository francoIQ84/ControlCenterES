from fastapi import APIRouter, Depends
from .inventory import router as inventory_router
from .sales import router as sales_router
from .customers import router as customers_router
from .dashboard import router as dashboard_router
from .settings import router as settings_router
from .storefront import router as storefront_router
from .media import router as media_router
from .auth import router as auth_router, verify_session, require_permission
from .categories import router as categories_router
from .expenses import router as expenses_router
from .backup import router as backup_router
from .whatsapp import router as whatsapp_router

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
api_router.include_router(backup_router, prefix="/backup", tags=["backup"], dependencies=[Depends(verify_session), Depends(require_permission("settings"))])
api_router.include_router(whatsapp_router, prefix="/whatsapp", tags=["whatsapp"])
