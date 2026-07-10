from fastapi import APIRouter
from src import database

router = APIRouter()

@router.get("/metrics")
def get_metrics():
    stats = database.get_dashboard_metrics()
    return stats
