from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src import database, meli_api

router = APIRouter()

class UpdateProductRequest(BaseModel):
    cost: float
    qty: int
    price: float
    price_web: float = 0.0
    images: str = ""
    description: str = ""
    is_web_active: int = 0

@router.get("/")
def get_products(query: str = None, status: str = None):
    products = database.get_all_products(query=query, status_filter=status)
    return {"products": products}

@router.post("/sync")
def sync_products():
    ok, count = meli_api.sync_products()
    if ok:
        return {"success": True, "count": count}
    else:
        raise HTTPException(status_code=500, detail=f"Failed to sync: {count}")

@router.put("/{ml_id}")
def update_product(ml_id: str, payload: UpdateProductRequest):
    # Get current product status from local cache
    db_status = "active"
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT status FROM products_cache WHERE ml_id = %s", (ml_id,))
                row = cursor.fetchone()
                if row:
                    db_status = row['status']
    except Exception:
        pass

    # Update locally (stock, ML price, cost)
    database.update_product_cost(ml_id, payload.cost)
    database.update_product_stock_price(ml_id, payload.qty, payload.price)
    
    # Update web details
    database.update_product_web_details(
        ml_id, 
        payload.price_web, 
        payload.images, 
        payload.description, 
        payload.is_web_active
    )
    
    # Sync to ML only if the product status is active or paused
    if db_status in ('active', 'paused'):
        ok, msg = meli_api.update_stock_and_price(ml_id, payload.qty, payload.price)
        if not ok:
            return {
                "success": True, 
                "warning": f"Guardado localmente. Sin embargo, falló la sincronización con Mercado Libre: {msg}"
            }
    else:
        return {
            "success": True, 
            "warning": f"Guardado localmente. Nota: Este artículo está cerrado ({db_status}) en Mercado Libre, por lo que no se sincronizaron cambios de stock/precio a la plataforma."
        }
        
    return {"success": True, "message": "Updated and synced"}
