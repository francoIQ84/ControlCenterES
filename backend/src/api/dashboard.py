from fastapi import APIRouter
from typing import Optional
from src import database

router = APIRouter()

@router.get("/metrics")
def get_metrics(period: str = "total", start_date: Optional[str] = None, end_date: Optional[str] = None):
    stats = database.get_dashboard_metrics(period=period, start_date_str=start_date, end_date_str=end_date)
    return stats

