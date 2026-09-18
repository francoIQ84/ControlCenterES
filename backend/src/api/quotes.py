import os
import time
import random
import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from src import database, meli_api
from src.api.auth import get_current_user, require_permission
from src.utils.quote_gen import generate_quote_pdf

router = APIRouter()


class QuoteItem(BaseModel):
    id: str
    title: str
    quantity: int = 1
    price: float = 0.0
    sku: Optional[str] = None
    discount_pct: Optional[float] = 0.0


class QuoteCreateRequest(BaseModel):
    customer_name: str
    customer_doc: Optional[str] = ""
    customer_email: Optional[str] = ""
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    price_source: Optional[str] = "web"
    items: List[QuoteItem]
    total_amount: float
    valid_days: Optional[int] = 7
    notes: Optional[str] = ""


class QuoteUpdateRequest(BaseModel):
    customer_name: Optional[str] = None
    customer_doc: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    price_source: Optional[str] = None
    items: Optional[List[QuoteItem]] = None
    total_amount: Optional[float] = None
    valid_days: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class QuoteConvertRequest(BaseModel):
    payment_method: Optional[str] = "Efectivo"
    shipping_status: Optional[str] = "delivered"
    auto_invoice: Optional[bool] = False
    invoice_type: Optional[str] = "B"
    notes: Optional[str] = ""


class CommercialConfigRequest(BaseModel):
    merchant_commercial_name: Optional[str] = ""
    merchant_commercial_address: Optional[str] = ""
    merchant_phone: Optional[str] = ""
    merchant_email: Optional[str] = ""


@router.get("/config", dependencies=[Depends(require_permission("quotes"))])
def get_quote_commercial_config():
    commercial_name = database.get_setting('merchant_commercial_name') or ''
    commercial_address = database.get_setting('merchant_commercial_address') or ''
    
    if not commercial_name or not commercial_address:
        try:
            import json
            web_cfg = json.loads(database.get_setting('web_config', '{}') or '{}')
            if not commercial_name and web_cfg.get('store_name'):
                commercial_name = web_cfg['store_name']
            if not commercial_address and web_cfg.get('address'):
                commercial_address = web_cfg['address']
        except Exception:
            pass

    if not commercial_name:
        commercial_name = "Experiencia Sustentable"
    if not commercial_address:
        commercial_address = "Zeballos 1726, Rosario, Santa Fe, Argentina"

    has_configured = bool(database.get_setting('merchant_commercial_address') or database.get_setting('web_config'))

    return {
        "merchant_commercial_name": commercial_name,
        "merchant_commercial_address": commercial_address,
        "merchant_name": database.get_setting('merchant_name', 'GENTILI FRANCO AGUSTIN'),
        "merchant_address": database.get_setting('merchant_address', ''),
        "merchant_phone": database.get_setting('merchant_phone', '+54 9 3412 59-0161'),
        "merchant_email": database.get_setting('merchant_email', ''),
        "has_commercial_address": has_configured
    }


@router.post("/config", dependencies=[Depends(require_permission("quotes"))])
def save_quote_commercial_config(req: CommercialConfigRequest):
    if req.merchant_commercial_name is not None:
        database.set_setting('merchant_commercial_name', req.merchant_commercial_name.strip())
    if req.merchant_commercial_address is not None:
        database.set_setting('merchant_commercial_address', req.merchant_commercial_address.strip())
    if req.merchant_phone is not None:
        database.set_setting('merchant_phone', req.merchant_phone.strip())
    if req.merchant_email is not None:
        database.set_setting('merchant_email', req.merchant_email.strip())
    return {"success": True, "message": "Datos comerciales guardados con éxito"}


@router.get("/next-number", dependencies=[Depends(require_permission("quotes"))])
def get_next_number():
    next_num = database.get_next_quote_number()
    return {"next_number": next_num}


@router.get("/", dependencies=[Depends(require_permission("quotes"))])
def list_quotes(
    status: Optional[str] = Query("all"),
    search: Optional[str] = Query(None),
    limit: int = Query(100),
    offset: int = Query(0)
):
    quotes = database.get_all_quotes(status=status, search=search, limit=limit, offset=offset)
    return {"quotes": quotes, "count": len(quotes)}


@router.get("/{quote_id}", dependencies=[Depends(require_permission("quotes"))])
def get_single_quote(quote_id: int):
    quote = database.get_quote_by_id(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return quote


@router.post("/", dependencies=[Depends(require_permission("quotes"))])
def create_new_quote(req: QuoteCreateRequest, current_user: dict = Depends(get_current_user)):
    operator = current_user.get('full_name') or current_user.get('username') or 'Admin'
    quote_number = database.get_next_quote_number()

    items_list = [item.dict() for item in req.items]
    if not items_list:
        raise HTTPException(status_code=400, detail="El presupuesto debe contener al menos un producto")

    created = database.create_quote(
        quote_number=quote_number,
        customer_name=req.customer_name.strip(),
        customer_doc=req.customer_doc.strip() if req.customer_doc else "",
        customer_email=req.customer_email.strip() if req.customer_email else "",
        customer_phone=req.customer_phone.strip() if req.customer_phone else "",
        customer_address=req.customer_address.strip() if req.customer_address else "",
        price_source=req.price_source or "web",
        items=items_list,
        total_amount=req.total_amount,
        valid_days=req.valid_days or 7,
        notes=req.notes or "",
        created_by_user=operator
    )

    # Pre-generate PDF
    try:
        generate_quote_pdf(created)
    except Exception as pdf_err:
        print(f"[Quote PDF Error] {pdf_err}")

    return {"success": True, "quote": created}


@router.put("/{quote_id}", dependencies=[Depends(require_permission("quotes"))])
def update_existing_quote(quote_id: int, req: QuoteUpdateRequest, current_user: dict = Depends(get_current_user)):
    existing = database.get_quote_by_id(quote_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    update_data = {}
    for field, val in req.dict(exclude_unset=True).items():
        if field == "items" and val is not None:
            update_data["items"] = [it if isinstance(it, dict) else it.dict() for it in val]
        elif val is not None:
            update_data[field] = val

    updated = database.update_quote(quote_id, update_data)

    # Regenerate PDF if updated
    try:
        generate_quote_pdf(updated)
    except Exception as pdf_err:
        print(f"[Quote PDF Regeneration Error] {pdf_err}")

    return {"success": True, "quote": updated}


@router.delete("/{quote_id}", dependencies=[Depends(require_permission("quotes"))])
def delete_single_quote(quote_id: int):
    existing = database.get_quote_by_id(quote_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    ok = database.delete_quote(quote_id)
    return {"success": ok}


@router.get("/{quote_id}/pdf")
def download_quote_pdf(quote_id: int, download: Optional[int] = Query(0)):
    quote = database.get_quote_by_id(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    try:
        pdf_path = generate_quote_pdf(quote)
        if not os.path.exists(pdf_path):
            raise HTTPException(status_code=500, detail="No se pudo generar el archivo PDF")
        
        filename = f"Presupuesto_{quote.get('quote_number', quote_id)}.pdf"
        disposition = "attachment" if download == 1 else "inline"
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=filename,
            headers={"Content-Disposition": f"{disposition}; filename=\"{filename}\""}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar PDF: {str(e)}")


@router.post("/{quote_id}/convert-to-order", dependencies=[Depends(require_permission("quotes"))])
def convert_quote_to_sale_order(quote_id: int, req: QuoteConvertRequest, current_user: dict = Depends(get_current_user)):
    quote = database.get_quote_by_id(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    if quote.get("status") == "approved" and quote.get("order_id"):
        raise HTTPException(status_code=400, detail=f"Este presupuesto ya fue convertido a venta (Orden #{quote['order_id']})")

    operator = current_user.get('full_name') or current_user.get('username') or 'Admin'
    items = quote.get("items") or []
    if not items:
        raise HTTPException(status_code=400, detail="El presupuesto no tiene productos para facturar")

    # Generate new order ID
    order_id = int(time.time() * 1000) + random.randint(1, 999)
    date_created = datetime.datetime.now().isoformat()

    items_list = []
    total_cost = 0.0
    any_linked = False

    # Deduct stock and sync with external channels
    for item in items:
        item_id = str(item.get("id") or "")
        item_title = item.get("title") or "Producto"
        item_qty = int(item.get("quantity") or 1)
        item_price = float(item.get("price") or 0.0)

        items_list.append({
            "id": item_id,
            "title": item_title,
            "quantity": item_qty,
            "price": item_price
        })

        try:
            prod = database.get_product_by_id(item_id)
            if prod:
                any_linked = True
                prod_cost = float(prod.get("cost_price") or 0.0)
                total_cost += (prod_cost * item_qty)

                ok_deduct, new_qty = database.deduct_product_stock_by_ml_id(item_id, item_qty)
                if ok_deduct:
                    # Sync to Mercado Libre
                    is_local = item_id.startswith("LOCAL-") or item_id.startswith("WEB-")
                    if not is_local and prod.get("status") in ("active", "paused") and prod.get("sync_meli", 1) == 1:
                        try:
                            meli_api.update_stock_and_price(item_id, new_qty, prod.get("price", item_price))
                        except Exception as meli_err:
                            print(f"[MeLi Sync on Quote Convert Error] {meli_err}")

                    # Sync to Tiendanube
                    try:
                        if prod.get("tn_id") and prod.get("tn_variant_id") and prod.get("sync_tn", 1) == 1:
                            from src import tn_api
                            if tn_api.is_connected() and not tn_api.is_demo_mode():
                                tn_api.update_tn_stock(prod["tn_id"], prod["tn_variant_id"], new_qty)
                    except Exception as tn_err:
                        print(f"[TN Sync on Quote Convert Error] {tn_err}")
        except Exception as stock_err:
            print(f"[Stock Deduction on Quote Convert Error] {stock_err}")

    # Create manual order in database
    buyer_clean_name = quote.get("customer_name") or "Cliente Presupuesto"
    buyer_nickname = buyer_clean_name.lower().replace(" ", "_")[:30]

    database.create_manual_order(
        order_id=order_id,
        date_created=date_created,
        buyer_nickname=buyer_nickname,
        buyer_name=buyer_clean_name,
        total_amount=float(quote.get("total_amount") or 0.0),
        status="paid",
        shipping_status=req.shipping_status or "delivered",
        items=items_list,
        source_platform="PRESUPUESTO",
        payment_method=req.payment_method or "Efectivo",
        payment_status="approved",
        cost_amount=total_cost,
        inventory_linked=1 if any_linked else 0,
        created_by_user=operator
    )

    # Mark quote as completed with order_id and completed_at
    completed_quote = database.mark_quote_completed(quote_id, order_id=order_id, completed_at=datetime.datetime.now())

    # Auto-invoice if requested
    invoice_created = False
    if req.auto_invoice:
        try:
            from src.utils import afip_ws
            doc_type = "CUIT" if len(quote.get("customer_doc") or "") > 9 else "99"
            afip_res = afip_ws.create_invoice(
                order_id=order_id,
                doc_type=doc_type,
                cuit=quote.get("customer_doc") or "",
                name=buyer_clean_name,
                pto_vta=int(database.get_setting("afip_pto_vta", "1")),
                cbte_tipo=11 if req.invoice_type == "C" else 6
            )
            invoice_created = afip_res.get("success", False)
        except Exception as inv_err:
            print(f"[Auto Invoice on Quote Convert Error] {inv_err}")

    return {
        "success": True,
        "order_id": order_id,
        "quote": completed_quote,
        "invoice_created": invoice_created,
        "message": f"¡Presupuesto #{quote.get('quote_number')} convertido a venta #{order_id} con éxito!"
    }
