from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from src import mp_api
from src.api.auth import require_permission, verify_session

router = APIRouter()

class SyncMPRequest(BaseModel):
    limit: int = 100
    date_from: Optional[str] = None

@router.get("/balance")
def get_balance(_=Depends(require_permission("dashboard"))):
    balance = mp_api.get_mp_balance()
    if not balance:
        return {
            'total_amount': 0.0,
            'available_balance': 0.0,
            'unavailable_balance': 0.0,
            'currency_id': 'ARS'
        }
    return balance

@router.post("/sync")
def sync_payments(req: SyncMPRequest, _=Depends(verify_session)):
    from src import meli_api
    try:
        meli_api.sync_orders(limit=req.limit)
    except Exception as e:
        print(f"[Sync MP Endpoint] Error syncing MeLi orders: {e}")

    ok, count_or_err = mp_api.sync_mp_payments(date_from=req.date_from, limit=req.limit)
    if ok:
        return {"success": True, "count": count_or_err}
    else:
        raise HTTPException(status_code=400, detail=str(count_or_err))

class CreateChargeRequest(BaseModel):
    items: list
    buyer_name: Optional[str] = ""
    buyer_email: Optional[str] = ""
    external_reference: Optional[str] = ""

@router.post("/create-charge")
def create_charge(req: CreateChargeRequest, _=Depends(require_permission("sales"))):
    ok, result_or_err = mp_api.create_payment_preference(req.items, req.buyer_name, req.buyer_email, req.external_reference)
    if ok:
        return {"success": True, "charge": result_or_err}
    else:
        raise HTTPException(status_code=400, detail=str(result_or_err))

class MPSettingsUpdateRequest(BaseModel):
    excluded_emails: str

@router.get("/settings")
def get_mp_settings(_=Depends(require_permission("settings"))):
    from src import database
    return {
        "excluded_emails": database.get_setting("mp_excluded_emails", "")
    }

@router.post("/settings")
def save_mp_settings(req: MPSettingsUpdateRequest, _=Depends(require_permission("settings"))):
    from src import database
    database.set_setting("mp_excluded_emails", req.excluded_emails.strip())
    return {"success": True, "excluded_emails": req.excluded_emails.strip()}

class LinkOrderMPRequest(BaseModel):
    order_id: int
    mp_payment_id: int
    mp_fee_amount: Optional[float] = 0.0

@router.get("/payments/{payment_id}")
def get_payment_details(payment_id: int, _=Depends(require_permission("sales"))):
    ok, result_or_err = mp_api.get_mp_payment_details(payment_id)
    if not ok:
        raise HTTPException(status_code=400, detail=str(result_or_err))
    return {"success": True, "payment": result_or_err}

@router.post("/link-order")
def link_order_endpoint(req: LinkOrderMPRequest, _=Depends(require_permission("sales"))):
    from src import database
    order = database.get_order_by_id(req.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    database.link_order_mp_payment(req.order_id, req.mp_payment_id, req.mp_fee_amount or 0.0)
    return {"success": True, "message": f"Pago MP #{req.mp_payment_id} vinculado correctamente a la orden #{req.order_id}"}

@router.post("/unlink-order/{order_id}")
def unlink_order_endpoint(order_id: int, _=Depends(require_permission("sales"))):
    from src import database, mp_api
    order = database.get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    
    mp_payment_id = database.unlink_order_mp_payment(order_id)
    if not mp_payment_id:
        return {"success": True, "message": "No había pago de Mercado Pago vinculado a esta orden."}

    # Restore the Mercado Pago payment as its own standalone row in orders_cache
    try:
        ok, p_details = mp_api.get_mp_payment_details(mp_payment_id)
        p = p_details if (ok and isinstance(p_details, dict)) else {}
        payer = p.get('payer') or {}
        payer_id = payer.get('id') or (int(mp_payment_id) if str(mp_payment_id).isdigit() else 999000)
        first_name = (payer.get('first_name') or '').strip()
        last_name = (payer.get('last_name') or '').strip()
        full_name = f"{first_name} {last_name}".strip()
        email = (payer.get('email') or '').strip()
        payment_type = p.get('payment_type_id') or ''
        payment_method_id = p.get('payment_method_id') or ''
        operation_type = p.get('operation_type') or ''

        if not full_name or full_name == "None None":
            if payment_type == 'bank_transfer' or payment_method_id in ['pix', 'cvu'] or operation_type in ['money_transfer']:
                full_name = "Transferencia Recibida (CVU/Banco)"
            else:
                full_name = email.split('@')[0] if (email and '@' in email) else f"Cliente MP #{mp_payment_id}"

        source_platform = 'MERCADOPAGO'
        if payment_type == 'bank_transfer' or payment_method_id in ['pix', 'cvu', 'account_money'] or operation_type in ['money_transfer']:
            source_platform = 'MERCADOPAGO_TRANSFER'
        elif 'pos' in operation_type or 'point' in operation_type or payment_type == 'ticket':
            source_platform = 'MERCADOPAGO_QR'
        elif operation_type == 'regular_payment':
            source_platform = 'MERCADOPAGO_LINK'

        payment_method_label = f"{payment_method_id} ({payment_type})".upper() if payment_method_id else "MERCADO PAGO"
        desc = p.get('description') or f"Cobro MP ({payment_method_label})"
        total_amount = float(p.get('transaction_amount') or order.get('total_amount') or 0.0)

        items_formatted = [{
            'item_id': f"MP-{mp_payment_id}",
            'title': desc,
            'quantity': 1,
            'unit_price': total_amount,
            'thumbnail': ''
        }]

        order_data = {
            'order_id': mp_payment_id,
            'date_created': p.get('date_created') or order.get('date_created'),
            'buyer': {
                'id': payer_id,
                'nickname': email or f"user_{payer_id}",
                'name': full_name,
                'email': email,
                'phone': payer.get('phone', {}).get('number', '') if isinstance(payer.get('phone'), dict) else '',
                'document_type': payer.get('identification', {}).get('type', 'DNI') if isinstance(payer.get('identification'), dict) else 'DNI',
                'document_number': payer.get('identification', {}).get('number', '') if isinstance(payer.get('identification'), dict) else '',
                'address': '',
            },
            'total_amount': total_amount,
            'currency_id': 'ARS',
            'status': 'paid',
            'payment_status': 'approved',
            'shipping_status': 'delivered',
            'items': items_formatted,
            'source_platform': source_platform,
            'payment_method': payment_method_label,
            'mp_payment_id': mp_payment_id,
            'mp_fee_amount': float(p.get('total_fee') or 0.0),
            'inventory_linked': 0,
            'cost_amount': 0.0
        }
        database.save_orders_and_customers([order_data])
        print(f"[Unlink MP] Cobro MP #{mp_payment_id} restaurado como venta independiente en el historial.")
    except Exception as e_restore:
        print(f"[Unlink MP Restore Error] {e_restore}")

    return {"success": True, "message": f"Pago MP #{mp_payment_id} desvinculado y restaurado como registro independiente."}

