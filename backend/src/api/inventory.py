from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src import database, meli_api
import random
import time

router = APIRouter()

class UpdateProductRequest(BaseModel):
    cost: float
    qty: int
    price: float
    price_web: float = 0.0
    images: str = ""
    description: str = ""
    is_web_active: int = 0

class CreateProductRequest(BaseModel):
    title: str
    qty: int
    price: float
    cost: float = 0.0
    price_web: float = 0.0
    images: str = ""
    description: str = ""
    is_web_active: int = 1
    publish_to_meli: bool = False

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

@router.post("/")
def create_product(payload: CreateProductRequest):
    # Determine ml_id based on publish_to_meli and demo mode
    is_demo = meli_api.is_demo_mode()
    
    if payload.publish_to_meli:
        if is_demo:
            # Generate a mock MLA id
            ml_id = f"MLA{random.randint(100000000, 999999999)}"
            status = 'active'
            permalink = f"https://articulo.mercadolibre.com.ar/{ml_id.replace('MLA', 'MLA-')}-articulo-demo"
        else:
            # In real mode, return an error message suggesting to create on ML and sync
            raise HTTPException(
                status_code=400, 
                detail="Para publicar en Mercado Libre en modo Real, por favor crea la publicación directamente desde la web de Mercado Libre y luego presiona Sincronizar en el panel de control. Esto asegura la correcta categorización y atributos de tu artículo."
            )
    else:
        # Local-only web product
        ml_id = f"LOCAL-{int(time.time() * 1000)}"
        status = 'local'
        permalink = ""

    product_data = {
        "ml_id": ml_id,
        "title": payload.title,
        "price": payload.price,
        "available_quantity": payload.qty,
        "cost_price": payload.cost,
        "permalink": permalink,
        "thumbnail": payload.images,  # use the provided image as thumbnail
        "status": status,
        "price_web": payload.price_web,
        "images": payload.images,
        "description": payload.description,
        "is_web_active": payload.is_web_active
    }

    try:
        database.create_product(product_data)
        return {"success": True, "ml_id": ml_id, "message": "Producto creado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar en base de datos: {str(e)}")

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
    
    # Sync to ML only if the product status is active or paused and NOT local-only
    is_local = ml_id.startswith('LOCAL-') or ml_id.startswith('WEB-')
    if db_status in ('active', 'paused') and not is_local:
        ok, msg = meli_api.update_stock_and_price(ml_id, payload.qty, payload.price)
        if not ok:
            return {
                "success": True, 
                "warning": f"Guardado localmente. Sin embargo, falló la sincronización con Mercado Libre: {msg}"
            }
    elif is_local:
        return {"success": True, "message": "Updated locally (local-only product)"}
    else:
        return {
            "success": True, 
            "warning": f"Guardado localmente. Nota: Este artículo está cerrado ({db_status}) en Mercado Libre, por lo que no se sincronizaron cambios de stock/precio a la plataforma."
        }
        
    return {"success": True, "message": "Updated and synced"}
