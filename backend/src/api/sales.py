from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from src import database, meli_api

router = APIRouter()

class SyncSalesRequest(BaseModel):
    limit: int = 2000
    date_from: Optional[str] = None
    date_to: Optional[str] = None

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
