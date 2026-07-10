from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src import database, meli_api

router = APIRouter()

class UpdateProductRequest(BaseModel):
    cost: float
    qty: int
    price: float

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
    # Update locally
    database.update_product_cost(ml_id, payload.cost)
    database.update_product_stock_price(ml_id, payload.qty, payload.price)
    
    # Sync to ML
    ok, msg = meli_api.update_stock_and_price(ml_id, payload.qty, payload.price)
    if not ok:
        raise HTTPException(status_code=500, detail=f"Failed to sync to ML: {msg}")
        
    return {"success": True, "message": "Updated and synced"}
