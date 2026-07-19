from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import re
from src import database

router = APIRouter()

class CategoryCreateRequest(BaseModel):
    name: str

def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text).strip('-')
    return text

@router.get("/")
def get_categories():
    categories = database.get_all_categories()
    return {"categories": categories}

@router.post("/")
def create_category(req: CategoryCreateRequest):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    slug = slugify(name)
    try:
        cat_id = database.create_category(name, slug)
        return {"success": True, "id": cat_id, "name": name, "slug": slug}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{category_id}")
def delete_category(category_id: int):
    try:
        database.delete_category(category_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
