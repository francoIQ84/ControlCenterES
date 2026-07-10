from fastapi import APIRouter
from .inventory import router as inventory_router
from .sales import router as sales_router
from .customers import router as customers_router
from .dashboard import router as dashboard_router
from .settings import router as settings_router
from .storefront import router as storefront_router

api_router = APIRouter()

api_router.include_router(inventory_router, prefix="/inventory", tags=["inventory"])
api_router.include_router(sales_router, prefix="/sales", tags=["sales"])
api_router.include_router(customers_router, prefix="/customers", tags=["customers"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])
api_router.include_router(storefront_router, prefix="/storefront", tags=["storefront"])
