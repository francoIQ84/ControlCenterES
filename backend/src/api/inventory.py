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
    use_meli_description: int = 1
    description_meli: Optional[str] = None
    is_web_active: int = 0
    category_id: Optional[int] = None
    sync_meli: int = 1
    min_stock: int = 0
    featured_order: int = 0
    is_hidden: int = 0

class CreateProductRequest(BaseModel):
    title: str
    qty: int
    price: float
    cost: float = 0.0
    cost_meli: float = 0.0
    price_web: float = 0.0
    images: str = ""
    description: str = ""
    use_meli_description: int = 1
    description_meli: str = ""
    is_web_active: int = 1
    publish_to_meli: bool = False
    category_id: Optional[int] = None
    sync_meli: int = 1
    min_stock: int = 0
    featured_order: int = 0

@router.get("/")
def get_products(query: str = None, status: str = None, show_hidden: bool = False, is_hidden: Optional[int] = None):
    products = database.get_all_products(query=query, status_filter=status, include_hidden=show_hidden, is_hidden=is_hidden)
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
    use_meli_description: int = 1
    description_meli: Optional[str] = None
    is_web_active: int = 0
    category_id: Optional[int] = None
    sync_meli: int = 1
    min_stock: int = 0
    featured_order: int = 0
    is_hidden: int = 0

class BulkUpdateRequest(BaseModel):
    items: list[BulkUpdateItem]

class FeaturedOrderRequest(BaseModel):
    featured_ids: list[str]

class ToggleHiddenRequest(BaseModel):
    is_hidden: Optional[int] = None

@router.put("/{ml_id}/toggle-hidden")
def toggle_product_hidden(ml_id: str, payload: Optional[ToggleHiddenRequest] = None):
    product = database.get_product_by_ml_id(ml_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    if payload and payload.is_hidden is not None:
        new_hidden = int(payload.is_hidden)
    else:
        new_hidden = 1 if int(product.get('is_hidden', 0)) == 0 else 0
        
    database.update_product_hidden_status(ml_id, new_hidden)
    return {"success": True, "ml_id": ml_id, "is_hidden": new_hidden, "message": "Estado de visibilidad actualizado correctamente"}

@router.put("/featured-order")
def set_featured_products_order(payload: FeaturedOrderRequest):
    try:
        database.update_featured_products_order(payload.featured_ids)
        return {"success": True, "message": "Orden de productos destacados actualizado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar orden de destacados: {str(e)}")

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
            item.min_stock,
            item.featured_order,
            item.use_meli_description,
            item.description_meli
        )

        is_local = item.ml_id.startswith('LOCAL-') or item.ml_id.startswith('WEB-')
        if db_status in ('active', 'paused') and not is_local and item.sync_meli == 1:
            ok, msg = meli_api.update_stock_and_price(item.ml_id, item.qty, item.price)
            if not ok:
                warnings.append(f"{item.ml_id}: Falló la sincronización con Mercado Libre: {msg}")
        elif not is_local and item.sync_meli == 1:
            warnings.append(f"{item.ml_id}: Artículo cerrado ({db_status}) en ML, no sincronizado.")

    return {"success": True, "warnings": warnings}

class BulkHideRequest(BaseModel):
    ml_ids: list[str]
    is_hidden: int = 1

class BulkWebActiveRequest(BaseModel):
    ml_ids: list[str]
    is_web_active: int = 1

class BulkCategoryRequest(BaseModel):
    ml_ids: list[str]
    category_id: Optional[int] = None

class BulkSyncMeliRequest(BaseModel):
    ml_ids: list[str]
    sync_meli: int = 1

class BulkPriceAdjustRequest(BaseModel):
    ml_ids: list[str]
    target: str = "both"  # 'meli', 'web', 'both'
    adjustment_type: str = "percentage"  # 'percentage', 'fixed'
    value: float = 0.0

@router.put("/bulk-hide")
def bulk_hide_products(payload: BulkHideRequest):
    if not payload.ml_ids:
        raise HTTPException(status_code=400, detail="No se especificaron productos para la acción masiva")
    database.bulk_update_hidden_status(payload.ml_ids, payload.is_hidden)
    action_text = "ocultados" if payload.is_hidden == 1 else "visibles"
    return {"success": True, "count": len(payload.ml_ids), "message": f"{len(payload.ml_ids)} productos marcados como {action_text}."}

@router.put("/bulk-web-active")
def bulk_web_active_products(payload: BulkWebActiveRequest):
    if not payload.ml_ids:
        raise HTTPException(status_code=400, detail="No se especificaron productos")
    database.bulk_update_web_active_status(payload.ml_ids, payload.is_web_active)
    state_text = "activados" if payload.is_web_active == 1 else "desactivados"
    return {"success": True, "count": len(payload.ml_ids), "message": f"{len(payload.ml_ids)} productos {state_text} en Tienda Web."}

@router.put("/bulk-category")
def bulk_category_products(payload: BulkCategoryRequest):
    if not payload.ml_ids:
        raise HTTPException(status_code=400, detail="No se especificaron productos")
    database.bulk_update_category(payload.ml_ids, payload.category_id)
    return {"success": True, "count": len(payload.ml_ids), "message": f"Categoría actualizada para {len(payload.ml_ids)} productos."}

@router.put("/bulk-sync-meli")
def bulk_sync_meli_products(payload: BulkSyncMeliRequest):
    if not payload.ml_ids:
        raise HTTPException(status_code=400, detail="No se especificaron productos")
    database.bulk_update_sync_meli(payload.ml_ids, payload.sync_meli)
    sync_text = "activada" if payload.sync_meli == 1 else "desactivada"
    return {"success": True, "count": len(payload.ml_ids), "message": f"Sincronización con Mercado Libre {sync_text} para {len(payload.ml_ids)} productos."}

@router.put("/bulk-price-adjust")
def bulk_price_adjust_products(payload: BulkPriceAdjustRequest):
    if not payload.ml_ids:
        raise HTTPException(status_code=400, detail="No se especificaron productos")
    database.bulk_adjust_prices(payload.ml_ids, payload.target, payload.adjustment_type, payload.value)
    
    warnings = []
    if payload.target in ('meli', 'both'):
        for ml_id in payload.ml_ids:
            is_local = ml_id.startswith('LOCAL-') or ml_id.startswith('WEB-')
            if not is_local:
                prod = database.get_product_by_ml_id(ml_id)
                if prod and prod.get('status') in ('active', 'paused') and prod.get('sync_meli', 1) == 1:
                    ok, msg = meli_api.update_stock_and_price(ml_id, prod.get('available_quantity', 0), prod.get('price', 0.0))
                    if not ok:
                        warnings.append(f"{ml_id}: Falló la sincronización con MeLi: {msg}")

    return {"success": True, "count": len(payload.ml_ids), "warnings": warnings, "message": f"Precios ajustados para {len(payload.ml_ids)} productos."}

class SaveDispatchScheduleRequest(BaseModel):
    enabled: bool
    weekday_days: int = 0
    weekend_days: int = 2
    weekend_start_day: int = 4
    weekend_start_hour: int = 18
    weekend_end_day: int = 0
    weekend_end_hour: int = 8

class ApplyDispatchScheduleNowRequest(BaseModel):
    ml_ids: Optional[list[str]] = None

@router.get("/dispatch-schedule")
def get_dispatch_schedule():
    enabled = database.get_setting("dispatch_schedule_enabled", "0") == "1"
    weekday_days = int(database.get_setting("dispatch_weekday_days", "0"))
    weekend_days = int(database.get_setting("dispatch_weekend_days", "2"))
    weekend_start_day = int(database.get_setting("dispatch_weekend_start_day", "4"))
    weekend_start_hour = int(database.get_setting("dispatch_weekend_start_hour", "18"))
    weekend_end_day = int(database.get_setting("dispatch_weekend_end_day", "0"))
    weekend_end_hour = int(database.get_setting("dispatch_weekend_end_hour", "8"))
    
    current_mode = meli_api.get_current_dispatch_mode()
    last_applied_mode = database.get_setting("dispatch_last_applied_mode", "")
    last_applied_at = database.get_setting("dispatch_last_applied_at", "")

    return {
        "enabled": enabled,
        "weekday_days": weekday_days,
        "weekend_days": weekend_days,
        "weekend_start_day": weekend_start_day,
        "weekend_start_hour": weekend_start_hour,
        "weekend_end_day": weekend_end_day,
        "weekend_end_hour": weekend_end_hour,
        "current_mode": current_mode,
        "last_applied_mode": last_applied_mode,
        "last_applied_at": last_applied_at
    }

@router.post("/dispatch-schedule")
def save_dispatch_schedule(payload: SaveDispatchScheduleRequest):
    database.set_setting("dispatch_schedule_enabled", "1" if payload.enabled else "0")
    database.set_setting("dispatch_weekday_days", str(payload.weekday_days))
    database.set_setting("dispatch_weekend_days", str(payload.weekend_days))
    database.set_setting("dispatch_weekend_start_day", str(payload.weekend_start_day))
    database.set_setting("dispatch_weekend_start_hour", str(payload.weekend_start_hour))
    database.set_setting("dispatch_weekend_end_day", str(payload.weekend_end_day))
    database.set_setting("dispatch_weekend_end_hour", str(payload.weekend_end_hour))

    return {"success": True, "message": "Configuración de programación de disponibilidad guardada correctamente."}

@router.post("/dispatch-schedule/apply-now")
def apply_dispatch_schedule_now(payload: Optional[ApplyDispatchScheduleNowRequest] = None):
    ml_ids = payload.ml_ids if payload else None
    ok, message = meli_api.apply_dispatch_schedule_rules(force=True, ml_ids=ml_ids)
    if not ok:
        raise HTTPException(status_code=500, detail=message)
    return {"success": True, "message": message}

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
        payload.min_stock,
        payload.featured_order
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

@router.post("/{ml_id}/sync-description")
def sync_single_product_description(ml_id: str):
    desc = meli_api.fetch_single_item_description(ml_id)
    if desc:
        database.update_product_description_meli(ml_id, desc)
        return {"success": True, "ml_id": ml_id, "description_meli": desc}
    else:
        return {"success": False, "ml_id": ml_id, "message": "No se pudo obtener la descripción de Mercado Libre"}

@router.post("/sync-descriptions")
def sync_all_product_descriptions():
    products = database.get_all_products()
    ml_products = [p for p in products if p.get('ml_id') and not p['ml_id'].startswith(('LOCAL-', 'WEB-'))]
    synced_count = 0
    from concurrent.futures import ThreadPoolExecutor
    def _fetch_and_save(p):
        ml_id = p['ml_id']
        desc = meli_api.fetch_single_item_description(ml_id)
        if desc:
            database.update_product_description_meli(ml_id, desc)
            return True
        return False

    return {"success": True, "count": synced_count, "message": f"Descripciones de Mercado Libre actualizadas para {synced_count} publicaciones."}

class ProfitabilityParamsRequest(BaseModel):
    cost_price: float
    cost_meli: float
    shipping_cost_est: float = 0.0
    tax_rate_pct: float = 3.5
    other_cost: float = 0.0

@router.get("/profitability")
def get_products_profitability():
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT ml_id, title, price, price_web, cost_price, cost_meli, 
                       shipping_cost_est, tax_rate_pct, other_cost, available_quantity, thumbnail
                FROM products_cache 
                WHERE is_hidden = 0 OR is_hidden IS NULL
                ORDER BY price DESC
            """)
            products = cursor.fetchall()
            
            result = []
            total_net_meli = 0.0
            total_net_web = 0.0
            critical_margin_count = 0
            
            for p in products:
                price = float(p.get('price') or 0.0)
                price_web = float(p.get('price_web') or 0.0)
                cost_price = float(p.get('cost_price') or 0.0)
                cost_meli_val = float(p.get('cost_meli') or 0.0)
                shipping_cost = float(p.get('shipping_cost_est') or 0.0)
                tax_pct = float(p.get('tax_rate_pct') or 3.5)
                other_cost = float(p.get('other_cost') or 0.0)

                # MeLi calculations
                # If cost_meli > 100, treat as flat fee, else percentage
                meli_commission = price * (cost_meli_val / 100.0) if cost_meli_val <= 100.0 else cost_meli_val
                tax_amount_meli = price * (tax_pct / 100.0)
                net_profit_meli = price - cost_price - meli_commission - shipping_cost - tax_amount_meli - other_cost
                margin_pct_meli = (net_profit_meli / price * 100.0) if price > 0 else 0.0

                # Web calculations (default 4.5% Mercado Pago payment gateway fee)
                web_commission = price_web * 0.045
                tax_amount_web = price_web * (tax_pct / 100.0)
                net_profit_web = price_web - cost_price - web_commission - tax_amount_web - other_cost
                margin_pct_web = (net_profit_web / price_web * 100.0) if price_web > 0 else 0.0

                diff_web_extra = net_profit_web - net_profit_meli

                if margin_pct_meli < 10.0:
                    critical_margin_count += 1

                total_net_meli += net_profit_meli
                total_net_web += net_profit_web

                result.append({
                    "ml_id": p['ml_id'],
                    "title": p['title'],
                    "thumbnail": p.get('thumbnail'),
                    "available_quantity": p['available_quantity'],
                    "price": price,
                    "price_web": price_web,
                    "cost_price": cost_price,
                    "cost_meli": cost_meli_val,
                    "shipping_cost_est": shipping_cost,
                    "tax_rate_pct": tax_pct,
                    "other_cost": other_cost,
                    "meli_commission": round(meli_commission, 2),
                    "tax_amount_meli": round(tax_amount_meli, 2),
                    "net_profit_meli": round(net_profit_meli, 2),
                    "margin_pct_meli": round(margin_pct_meli, 2),
                    "web_commission": round(web_commission, 2),
                    "tax_amount_web": round(tax_amount_web, 2),
                    "net_profit_web": round(net_profit_web, 2),
                    "margin_pct_web": round(margin_pct_web, 2),
                    "diff_web_extra": round(diff_web_extra, 2)
                })

            avg_margin_meli = sum(p['margin_pct_meli'] for p in result) / len(result) if result else 0.0
            avg_margin_web = sum(p['margin_pct_web'] for p in result) / len(result) if result else 0.0

            return {
                "products": result,
                "summary": {
                    "total_products": len(result),
                    "critical_margin_count": critical_margin_count,
                    "avg_margin_meli": round(avg_margin_meli, 2),
                    "avg_margin_web": round(avg_margin_web, 2),
                    "total_net_meli_est": round(total_net_meli, 2),
                    "total_net_web_est": round(total_net_web, 2)
                }
            }

@router.put("/profitability/{ml_id}")
def update_product_profitability_params(ml_id: str, req: ProfitabilityParamsRequest):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE products_cache 
                SET cost_price = %s, cost_meli = %s, shipping_cost_est = %s, tax_rate_pct = %s, other_cost = %s
                WHERE ml_id = %s RETURNING ml_id
                """,
                (req.cost_price, req.cost_meli, req.shipping_cost_est, req.tax_rate_pct, req.other_cost, ml_id)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            return {"success": True, "ml_id": ml_id}



