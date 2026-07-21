from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from src import database

router = APIRouter()

class CustomerBase(BaseModel):
    nickname: Optional[str] = ""
    full_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    document_type: Optional[str] = ""
    document_number: Optional[str] = ""
    address: Optional[str] = ""

class CustomerCreate(CustomerBase):
    buyer_id: Optional[int] = None
    source_platform: Optional[str] = "MANUAL"

class CustomerUpdate(CustomerBase):
    pass

@router.get("/")
def get_customers():
    customers = database.get_all_customers()
    return {"customers": customers}

@router.post("/")
def create_customer(data: CustomerCreate):
    try:
        new_id = database.create_customer(data.dict())
        return {"status": "success", "buyer_id": new_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{buyer_id}")
def update_customer(buyer_id: int, data: CustomerUpdate):
    try:
        database.update_customer(buyer_id, data.dict())
        return {"status": "success", "buyer_id": buyer_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{buyer_id}")
def delete_customer(buyer_id: int):
    try:
        database.delete_customer(buyer_id)
        return {"status": "success", "buyer_id": buyer_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
