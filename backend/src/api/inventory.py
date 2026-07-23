from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel
from src import database, meli_api
import random
import time

router = APIRouter()

class UpdateProductRequest(BaseModel):
    cost: float
    cost_meli: float = 0.0
    qty: int
    price: float
    price_web: float = 0.0
    images: str = ""
    description: str = ""
    is_web_active: int = 0
    category_id: Optional[int] = None
    sync_meli: int = 1
    min_stock: int = 0

class CreateProductRequest(BaseModel):
    title: str
    qty: int
    price: float
    cost: float = 0.0
    cost_meli: float = 0.0
    price_web: float = 0.0
    images: str = ""
    description: str = ""
    is_web_active: int = 1
    publish_to_meli: bool = False
    category_id: Optional[int] = None
    sync_meli: int = 1
    min_stock: int = 0

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

@router.post("/sync-costs")
def sync_product_costs():
    ok, count = meli_api.sync_product_costs()
    if ok:
        return {"success": True, "count": count, "message": f"Costos de Mercado Libre actualizados desde la API para {count} publicaciones."}
    else:
        raise HTTPException(status_code=500, detail=f"Error al actualizar costos: {count}")

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
        "cost_meli": payload.cost_meli,
        "permalink": permalink,
        "thumbnail": payload.images,  # use the provided image as thumbnail
        "status": status,
        "price_web": payload.price_web,
        "images": payload.images,
        "description": payload.description,
        "is_web_active": payload.is_web_active,
        "category_id": payload.category_id,
        "sync_meli": payload.sync_meli,
        "min_stock": payload.min_stock
    }

    try:
        database.create_product(product_data)
        return {"success": True, "ml_id": ml_id, "message": "Producto creado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar en base de datos: {str(e)}")

class BulkUpdateItem(BaseModel):
    ml_id: str
    cost: float
    cost_meli: float = 0.0
    qty: int
    price: float
    price_web: float = 0.0
    images: str = ""
    description: str = ""
    is_web_active: int = 0
    category_id: Optional[int] = None
    sync_meli: int = 1
    min_stock: int = 0

class BulkUpdateRequest(BaseModel):
    items: list[BulkUpdateItem]

@router.put("/bulk")
def bulk_update_products(payload: BulkUpdateRequest):
    warnings = []
    for item in payload.items:
        db_status = "active"
        try:
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT status FROM products_cache WHERE ml_id = %s", (item.ml_id,))
                    row = cursor.fetchone()
                    if row:
                        db_status = row['status']
        except Exception:
            pass

        database.update_product_cost(item.ml_id, item.cost, item.cost_meli)
        database.update_product_stock_price(item.ml_id, item.qty, item.price)
        database.update_product_web_details(
            item.ml_id, 
            item.price_web, 
            item.images, 
            item.description, 
            item.is_web_active,
            item.category_id,
            item.sync_meli,
            item.min_stock
        )

        is_local = item.ml_id.startswith('LOCAL-') or item.ml_id.startswith('WEB-')
        if db_status in ('active', 'paused') and not is_local and item.sync_meli == 1:
            ok, msg = meli_api.update_stock_and_price(item.ml_id, item.qty, item.price)
            if not ok:
                warnings.append(f"{item.ml_id}: Falló la sincronización con Mercado Libre: {msg}")
        elif not is_local and item.sync_meli == 1:
            warnings.append(f"{item.ml_id}: Artículo cerrado ({db_status}) en ML, no sincronizado.")

    return {"success": True, "warnings": warnings}

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
    database.update_product_cost(ml_id, payload.cost, payload.cost_meli)
    database.update_product_stock_price(ml_id, payload.qty, payload.price)
    
    # Update web details
    database.update_product_web_details(
        ml_id, 
        payload.price_web, 
        payload.images, 
        payload.description, 
        payload.is_web_active,
        payload.category_id,
        payload.sync_meli,
        payload.min_stock
    )
    
    # Sync to ML only if the product status is active or paused and NOT local-only AND sync_meli is enabled
    is_local = ml_id.startswith('LOCAL-') or ml_id.startswith('WEB-')
    if db_status in ('active', 'paused') and not is_local and payload.sync_meli == 1:
        ok, msg = meli_api.update_stock_and_price(ml_id, payload.qty, payload.price)
        if not ok:
            return {
                "success": True, 
                "warning": f"Guardado localmente. Sin embargo, falló la sincronización con Mercado Libre: {msg}"
            }
    elif is_local:
        return {"success": True, "message": "Updated locally (local-only product)"}
    elif payload.sync_meli == 0:
        return {"success": True, "message": "Updated locally (Mercado Libre sync is disabled for this product)"}
    else:
        return {
            "success": True, 
            "warning": f"Guardado localmente. Nota: Este artículo está cerrado ({db_status}) en Mercado Libre, por lo que no se sincronizaron cambios de stock/precio a la plataforma."
        }
        
    return {"success": True, "message": "Updated and synced"}

class QuickStockRequest(BaseModel):
    ml_id: str
    qty: Optional[int] = None
    delta: Optional[int] = None
    price: Optional[float] = None
    price_web: Optional[float] = None

@router.get("/scan/{code}")
def scan_product_by_code(code: str):
    # Extract ml_id from CC-PROD-{ml_id} or raw code
    raw_code = code.strip()
    if raw_code.startswith("CC-PROD-"):
        target_id = raw_code.replace("CC-PROD-", "")
    else:
        target_id = raw_code
        
    product = database.get_product_by_ml_id(target_id)
    if not product:
        # Try searching by exact ml_id or partial title/ml_id
        prods = database.get_all_products(query=target_id)
        if prods:
            product = prods[0]
            
    if not product:
        raise HTTPException(status_code=404, detail=f"No se encontró ningún producto con el código: {raw_code}")
        
    return {"product": product}

@router.post("/quick-stock")
def quick_adjust_stock(payload: QuickStockRequest):
    # Fetch product first
    product = database.get_product_by_ml_id(payload.ml_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
        
    current_qty = product.get('available_quantity', 0)
    
    if payload.qty is not None:
        new_qty = max(0, payload.qty)
    elif payload.delta is not None:
        new_qty = max(0, current_qty + payload.delta)
    else:
        new_qty = current_qty
        
    new_price = float(payload.price) if payload.price is not None else float(product.get('price', 0.0))
    new_price_web = float(payload.price_web) if payload.price_web is not None else float(product.get('price_web', 0.0))
    
    # Update local DB stock and price
    database.update_product_stock_price(payload.ml_id, new_qty, new_price)
    
    if payload.price_web is not None:
        database.update_product_web_details(
            payload.ml_id,
            new_price_web,
            product.get('images', ''),
            product.get('description', ''),
            product.get('is_web_active', 1),
            product.get('category_id'),
            product.get('sync_meli', 1),
            product.get('min_stock', 0)
        )
    
    # Sync with Mercado Libre if applicable
    db_status = product.get('status', 'active')
    sync_meli = product.get('sync_meli', 1)
    is_local = payload.ml_id.startswith('LOCAL-') or payload.ml_id.startswith('WEB-')
    
    warning = None
    if db_status in ('active', 'paused') and not is_local and sync_meli == 1:
        ok, msg = meli_api.update_stock_and_price(payload.ml_id, new_qty, new_price)
        if not ok:
            warning = f"Cambios guardados localmente. Error al sincronizar con Mercado Libre: {msg}"
            
    # Fetch updated product
    updated_product = database.get_product_by_ml_id(payload.ml_id)
    return {
        "success": True, 
        "product": updated_product,
        "new_qty": new_qty,
        "new_price": new_price,
        "warning": warning
    }

@router.get("/export-excel")
def export_inventory_excel():
    import csv
    import io
    import time
    from fastapi.responses import Response

    products = database.get_all_products()
    
    output = io.StringIO()
    output.write('\ufeff')
    
    writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
    
    headers = [
        "ID / SKU",
        "Título del Producto",
        "Categoría",
        "Stock Actual",
        "Stock Mínimo",
        "Alerta Stock",
        "Costo Base ($)",
        "Costo ML ($)",
        "Costo Total ($)",
        "Precio ML ($)",
        "Precio Web ($)",
        "Ganancia Est. ML ($)",
        "Margen ML (%)",
        "Ganancia Est. Web ($)",
        "Margen Web (%)",
        "Visitas ML",
        "Visitas Web",
        "Visitas Totales",
        "Activo en Web",
        "Sincronizar ML",
        "Estado ML",
        "Última Modificación"
    ]
    writer.writerow(headers)
    
    for p in products:
        cost_base = p.get('cost_price') or 0.0
        cost_ml = p.get('cost_meli') or 0.0
        cost_total = cost_base + cost_ml
        price_ml = p.get('price') or 0.0
        price_web = p.get('price_web') or 0.0
        
        profit_ml = price_ml - cost_total if price_ml else 0.0
        margin_ml = (profit_ml / price_ml * 100) if price_ml > 0 else 0.0
        
        profit_web = price_web - cost_base if price_web else 0.0
        margin_web = (profit_web / price_web * 100) if price_web > 0 else 0.0
        
        min_stock = p.get('min_stock') or 3
        qty = p.get('available_quantity') or 0
        
        visits_meli = p.get('visits_meli') or 0
        visits_web = p.get('visits_web') or 0
        
        writer.writerow([
            p.get('ml_id') or '',
            p.get('title') or '',
            p.get('category_name') or 'Sin categoría',
            qty,
            min_stock,
            'CRÍTICO' if qty <= min_stock else 'OK',
            f"{cost_base:.2f}".replace('.', ','),
            f"{cost_ml:.2f}".replace('.', ','),
            f"{cost_total:.2f}".replace('.', ','),
            f"{price_ml:.2f}".replace('.', ','),
            f"{price_web:.2f}".replace('.', ','),
            f"{profit_ml:.2f}".replace('.', ','),
            f"{margin_ml:.1f}".replace('.', ','),
            f"{profit_web:.2f}".replace('.', ','),
            f"{margin_web:.1f}".replace('.', ','),
            visits_meli,
            visits_web,
            visits_meli + visits_web,
            'Sí' if p.get('is_web_active') else 'No',
            'Sí' if p.get('sync_meli') != 0 else 'No',
            p.get('status') or '',
            str(p.get('last_modified')) if p.get('last_modified') else ''
        ])
        
    csv_bytes = output.getvalue().encode('utf-8')
    filename = f"inventario_{time.strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

