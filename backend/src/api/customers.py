from fastapi import APIRouter
from src import database

router = APIRouter()

@router.get("/")
def get_customers():
    customers = database.get_all_customers()
    return {"customers": customers}
