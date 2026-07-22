from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from src import mp_api
from src.api.auth import require_permission

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
def sync_payments(req: SyncMPRequest, _=Depends(require_permission("sales"))):
    ok, count_or_err = mp_api.sync_mp_payments(date_from=req.date_from, limit=req.limit)
    if ok:
        return {"success": True, "count": count_or_err}
    else:
        raise HTTPException(status_code=400, detail=str(count_or_err))
