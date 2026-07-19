from fastapi import APIRouter
from src import database

router = APIRouter()

@router.get("/metrics")
def get_metrics(period: str = "total"):
    stats = database.get_dashboard_metrics(period=period)
    return stats
