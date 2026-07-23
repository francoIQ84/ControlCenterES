from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datetime
import time
import random
from src import database, meli_api

router = APIRouter()

class SyncSalesRequest(BaseModel):
    limit: int = 2000
    date_from: Optional[str] = None
    date_to: Optional[str] = None

class UpdateShippingRequest(BaseModel):
    shipping_status: str

class ManualOrderProduct(BaseModel):
    id: str
    title: str
    quantity: int
    price: float

class ManualOrderRequest(BaseModel):
    buyer_nickname: str
    buyer_name: str
    total_amount: float
    shipping_status: str
    source_platform: str
    items: List[ManualOrderProduct]
    payment_method: Optional[str] = None

@router.get("/")
def get_sales():
    orders = database.get_all_orders()
    return {"orders": orders}

@router.get("/sync-afip")
def sync_afip_endpoint(pto_vta: Optional[int] = None, cbte_tipo: Optional[int] = None):
    import json
    
    # 1. Read configuration settings
    if pto_vta is None:
        pto_vta = int(database.get_setting('afip_pto_vta', '1'))
    if cbte_tipo is None:
        cbte_tipo = int(database.get_setting('afip_type_cmp', '11'))
        
    afip_enabled = database.get_setting('afip_enabled', '0') == '1'
    cuit_raw = database.get_setting('afip_cuit', '30-71234567-9')
    cuit = cuit_raw.replace("-", "").strip()
    env = database.get_setting('afip_environment', 'homologacion')
    
    cert_path = "backend/data/afip/arca.crt"
    key_path = "backend/data/afip/arca.key"
    has_credentials = os.path.exists(cert_path) and os.path.exists(key_path)
    
    # 2. Get existing invoice numbers from DB to avoid double-querying
    existing_nums = set()
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT invoice_number FROM orders_cache WHERE invoice_number LIKE %s", (f"{pto_vta:04d}-%",))
            rows = cursor.fetchall()
            for r in rows:
                if r['invoice_number'] and '-' in r['invoice_number']:
                    try:
                        num = int(r['invoice_number'].split('-')[1])
                        existing_nums.add(num)
                    except ValueError:
                        pass

    # 3. Determine last authorized invoice number
    if not afip_enabled or not has_credentials:
        # Mock mode fallback
        max_existing = max(existing_nums) if existing_nums else 0
        last_authorized_num = max_existing + 5
        missing_nums = [num for num in range(1, last_authorized_num + 1) if num not in existing_nums]
        missing_nums.sort(reverse=True)
        to_sync = missing_nums[:5]  # Limit mock sync to 5 items at a time
    else:
        # Real AFIP mode
        from src.utils.afip_ws import get_wsaa_token, get_last_invoice_number, consult_invoice
        try:
            token, sign = get_wsaa_token(cuit, cert_path, key_path, env)
            last_authorized_num = get_last_invoice_number(token, sign, cuit, pto_vta, cbte_tipo, env)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al autenticar/consultar AFIP: {str(e)}")
            
        missing_nums = [num for num in range(1, last_authorized_num + 1) if num not in existing_nums]
        missing_nums.sort(reverse=True)
        to_sync = missing_nums[:100]  # Limit to 100 per batch to prevent IP ban or timeout

    # 4. Sync each missing invoice
    synced_count = 0
    from src.utils.afip_ws import consult_invoice
    
    # Fetch token and sign for target loop if in real mode
    token, sign = None, None
    if afip_enabled and has_credentials:
        from src.utils.afip_ws import get_wsaa_token
        try:
            token, sign = get_wsaa_token(cuit, cert_path, key_path, env)
        except Exception:
            pass

    for num in to_sync:
        try:
            res = consult_invoice(token, sign, cuit, pto_vta, cbte_tipo, num, env)
            if res.get("success"):
                # Persist customer
                buyer = res.get("buyer", {})
                if buyer and buyer.get("id"):
                    with database.get_connection() as conn:
                        with conn.cursor() as cursor:
                            cursor.execute('''
                                INSERT INTO customers 
                                (buyer_id, nickname, full_name, document_type, document_number, address)
                                VALUES (%s, %s, %s, %s, %s, %s)
                                ON CONFLICT (buyer_id) DO UPDATE SET
                                    full_name = EXCLUDED.full_name,
                                    document_type = EXCLUDED.document_type,
                                    document_number = EXCLUDED.document_number,
                                    address = EXCLUDED.address
                            ''', (
                                buyer.get('id'),
                                buyer.get('nickname', ''),
                                buyer.get('name', ''),
                                buyer.get('document_type', ''),
                                buyer.get('document_number', ''),
                                buyer.get('address', '')
                            ))
                
                # Persist/update order in cache
                order_id = res.get("order_id")
                date_created = res.get("date_created")
                total_amount = res.get("total_amount")
                cae = res.get("afip_cae")
                cae_exp = res.get("afip_cae_exp")
                invoice_number = res.get("invoice_number")
                
                items = [{"id": "AFIP-SYNC", "title": "Concepto Facturado", "quantity": 1, "price": total_amount}]
                
                with database.get_connection() as conn:
                    with conn.cursor() as cursor:
                        cursor.execute('''
                            INSERT INTO orders_cache 
                            (order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform, payment_method, invoice_number, afip_cae, afip_cae_exp)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (order_id) DO UPDATE SET
                                invoice_generated = 1,
                                invoice_number = EXCLUDED.invoice_number,
                                afip_cae = EXCLUDED.afip_cae,
                                afip_cae_exp = EXCLUDED.afip_cae_exp,
                                total_amount = EXCLUDED.total_amount,
                                buyer_id = EXCLUDED.buyer_id,
                                buyer_nickname = EXCLUDED.buyer_nickname,
                                buyer_name = EXCLUDED.buyer_name
                        ''', (
                            order_id,
                            date_created,
                            buyer.get('id') if buyer else None,
                            buyer.get('nickname', '') if buyer else '',
                            buyer.get('name', '') if buyer else '',
                            total_amount,
                            'ARS',
                            'paid',
                            'approved',
                            'delivered',
                            json.dumps(items),
                            1,
                            'AFIP',
                            'other',
                            invoice_number,
                            cae,
                            cae_exp
                        ))
                synced_count += 1
        except Exception as e:
            print(f"Error syncing invoice {num}: {str(e)}")
            continue
            
    return {
        "success": True,
        "synced_count": synced_count,
        "last_authorized": last_authorized_num,
        "to_sync_total": len(missing_nums)
    }

@router.post("/sync")
def sync_sales(req: SyncSalesRequest):
    ok, count = meli_api.sync_orders(limit=req.limit, date_from=req.date_from, date_to=req.date_to)
    if ok:
        return {"success": True, "count": count}
    else:
        raise HTTPException(status_code=500, detail=f"Failed to sync: {count}")

@router.put("/{order_id}/shipping")
def update_shipping(order_id: int, req: UpdateShippingRequest):
    database.update_order_shipping_status(order_id, req.shipping_status)
    return {"success": True}

@router.post("/")
def create_order(req: ManualOrderRequest):
    order_id = int(time.time() * 1000) + random.randint(1, 999)
    date_created = datetime.datetime.now().isoformat()
    
    items_list = []
    for item in req.items:
        items_list.append({
            "id": item.id,
            "title": item.title,
            "quantity": item.quantity,
            "price": item.price
        })
        
    database.create_manual_order(
        order_id=order_id,
        date_created=date_created,
        buyer_nickname=req.buyer_nickname,
        buyer_name=req.buyer_name,
        total_amount=req.total_amount,
        status="paid",
        shipping_status=req.shipping_status,
        items=items_list,
        source_platform=req.source_platform,
        payment_method=req.payment_method
    )
    return {"success": True, "order_id": order_id}

class InvoiceOptionsRequest(BaseModel):
    doc_type: Optional[str] = '99' # '99' for Consumidor Final, 'CUIT' for CUIT
    cuit: Optional[str] = None
    name: Optional[str] = None

@router.get("/lookup-cuit/{cuit}")
def lookup_cuit_endpoint(cuit: str):
    from src.utils.afip_ws import lookup_cuit
    try:
        res = lookup_cuit(cuit)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{order_id}/invoice")
def create_invoice_endpoint(order_id: int, req: Optional[InvoiceOptionsRequest] = None):
    order = database.get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
        
    if req and req.doc_type == 'CUIT' and req.cuit:
        buyer = order.get('buyer', {})
        if not isinstance(buyer, dict):
            buyer = {}
        clean_cuit = "".join([c for c in str(req.cuit) if c.isdigit()])
        buyer['document_type'] = 'CUIT'
        buyer['document_number'] = clean_cuit
        if req.name:
            buyer['name'] = req.name
        order['buyer'] = buyer

    from src.utils.afip_ws import create_invoice
    res = create_invoice(order)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Error desconocido al facturar"))
        
    return res

@router.get("/{order_id}/invoice/pdf")
def get_invoice_pdf_endpoint(order_id: int):
    filename = f"factura_{order_id}.pdf"
    filepath = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'invoices', filename)
    
    if not os.path.exists(filepath):
        order = database.get_order_by_id(order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")
        from src.utils.invoice_gen import generate_invoice_pdf
        generate_invoice_pdf(order)
        
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="El archivo PDF de la factura no existe")
        
    return FileResponse(filepath, media_type="application/pdf", filename=filename)

@router.get("/{order_id}/meli-invoice/pdf")
def get_meli_invoice_pdf_endpoint(order_id: int):
    pdf_bytes = meli_api.download_meli_invoice(order_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="No se encontró factura adjunta en Mercado Libre para esta venta.")
        
    # Guardamos temporalmente para devolverlo
    os.makedirs("backend/invoices", exist_ok=True)
    filepath = os.path.join("backend/invoices", f"meli_factura_{order_id}.pdf")
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)
        
    return FileResponse(filepath, media_type="application/pdf", filename=f"meli_factura_{order_id}.pdf")

class MessageManualRequest(BaseModel):
    message_type: str  # 'purchase' | 'shipping' | 'invoice'
    custom_text: Optional[str] = None

@router.post("/{order_id}/send-message")
def send_manual_message(order_id: str, req: MessageManualRequest):
    # Retrieve message text based on type
    if req.message_type == 'purchase':
        msg_text = req.custom_text or database.get_setting('meli_msg_purchase', '¡Hola! Gracias por tu compra. Nos pondremos en contacto a la brevedad para coordinar. ¡Saludos!')
    elif req.message_type == 'shipping':
        msg_text = req.custom_text or database.get_setting('meli_msg_shipping', 'Hola, te informamos que tu pedido está en camino. Puedes realizar el seguimiento desde el detalle de tu compra. ¡Gracias por confiar en nosotros!')
    elif req.message_type == 'invoice':
        msg_text = req.custom_text or database.get_setting('meli_msg_invoice', 'Hola, te informamos que ya adjuntamos tu factura digital a los detalles de tu compra. ¡Saludos!')
    else:
        raise HTTPException(status_code=400, detail="Tipo de mensaje inválido")

    if not msg_text.strip():
        raise HTTPException(status_code=400, detail="El contenido del mensaje no puede estar vacío")

    ok, err = meli_api.send_post_sale_message(order_id, msg_text)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    # If it was a shipping message, update state to avoid resending automatically
    if req.message_type == 'shipping':
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("UPDATE orders_cache SET shipping_msg_sent = 1 WHERE order_id = %s", (order_id,))

    return {"success": True, "message": "Mensaje enviado exitosamente"}

class LinkInventoryItem(BaseModel):
    ml_id: str
    quantity: int = 1

class LinkInventoryRequest(BaseModel):
    items: List[LinkInventoryItem]

@router.post("/{order_id}/link-inventory")
def link_order_inventory_endpoint(order_id: int, req: LinkInventoryRequest):
    order = database.get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Venta/Cobro no encontrado")

    if not req.items:
        raise HTTPException(status_code=400, detail="Debes especificar al menos un producto a vincular")

    formatted_items = []
    total_cost = 0.0

    for item in req.items:
        prod = database.get_product_by_id(item.ml_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Producto {item.ml_id} no encontrado en el inventario")

        qty = max(1, item.quantity)
        prod_cost = float(prod.get('cost_price', 0.0))
        total_cost += (prod_cost * qty)

        formatted_items.append({
            'item_id': prod['ml_id'],
            'title': prod['title'],
            'quantity': qty,
            'unit_price': float(prod.get('price', 0.0)),
            'thumbnail': prod.get('thumbnail', '')
        })

        # Deduct quantity from inventory
        current_stock = int(prod.get('available_quantity', 0))
        new_stock = max(0, current_stock - qty)
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("UPDATE products_cache SET available_quantity = %s WHERE ml_id = %s", (new_stock, prod['ml_id']))

    database.link_order_inventory(order_id, formatted_items, total_cost)
    return {"success": True, "message": "Inventario vinculado y stock actualizado correctamente"}
