from fastapi import APIRouter, HTTPException
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

@router.get("/")
def get_sales():
    orders = database.get_all_orders()
    return {"orders": orders}

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
        source_platform=req.source_platform
    )
    return {"success": True, "order_id": order_id}
