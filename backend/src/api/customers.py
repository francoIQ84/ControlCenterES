from fastapi import APIRouter, HTTPException, File, UploadFile
from pydantic import BaseModel
from typing import Optional, List
from src import database
import requests

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

class BulkDeleteRequest(BaseModel):
    buyer_ids: List[int]


@router.get("/")
def get_customers():
    customers = database.get_all_customers()
    return {"customers": customers}

@router.get("/central")
def get_central_crm():
    try:
        data = database.get_unified_crm_data()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sync-whatsapp")
def sync_whatsapp_contacts():
    status = database.get_setting("whatsapp_status", "disconnected")
    if status != "connected":
        return {
            "status": "warning",
            "message": "WhatsApp no está vinculado actualmente. Ve a Configuración > Asistente WhatsApp (IA) y presiona 'Generar Código QR de Vinculación' para escanear el QR."
        }
    try:
        # Call Node Baileys server on port 8091
        res = requests.get("http://127.0.0.1:8091/sync-contacts", timeout=8)
        if res.status_code == 200:
            res_json = res.json()
            contacts = res_json.get('contacts', [])
            synced_count = database.sync_whatsapp_contacts_bulk(contacts)
            return {"status": "success", "synced_count": synced_count, "total_found": len(contacts)}
        else:
            return {"status": "warning", "message": f"No se pudo consultar la lista de contactos del servicio de WhatsApp (HTTP {res.status_code}): {res.text}"}
    except Exception as e:
        return {"status": "error", "message": f"Error de conexión con el servicio de WhatsApp: {str(e)}"}

@router.post("/analyze-inquiries")
def analyze_chat_inquiries():
    try:
        analyzed = database.run_historical_whatsapp_chat_analysis()
        return {"status": "success", "analyzed_count": analyzed}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import-whatsapp-file")
async def import_whatsapp_chat_file_upload(file: UploadFile = File(...), key_file: Optional[UploadFile] = File(None)):
    try:
        content_bytes = await file.read()
        key_bytes = None
        if key_file:
            key_bytes = await key_file.read()
            
        try:
            content_str = content_bytes.decode('utf-8')
        except UnicodeDecodeError:
            content_str = content_bytes.decode('latin-1', errors='ignore')
            
        result = database.import_whatsapp_chat_file(
            content_str=content_str,
            filename=file.filename or 'chat.txt',
            key_bytes=key_bytes,
            raw_bytes=content_bytes
        )
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar archivo de WhatsApp: {str(e)}")

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

@router.post("/bulk-delete")
def delete_customers_bulk(payload: BulkDeleteRequest):
    try:
        deleted_count = database.delete_customers_bulk(payload.buyer_ids)
        return {"status": "success", "deleted_count": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{buyer_id}")
def delete_customer(buyer_id: int):
    try:
        database.delete_customer(buyer_id)
        return {"status": "success", "buyer_id": buyer_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

