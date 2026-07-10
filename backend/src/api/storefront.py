from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from src import database

router = APIRouter()

@router.get("/products")
def get_storefront_products():
    # Only return products that are active for the web
    products = database.get_all_products(is_web_active=1)
    
    # We might want to filter or map the response so we don't expose ML specific things if we don't want to
    # but for simplicity, we'll return the list and let the frontend map it.
    # However, it's a good practice to ensure images are parsed if they are JSON.
    mapped = []
    for p in products:
        imgs = []
        if p['images']:
            imgs = [i.strip() for i in p['images'].split(',') if i.strip()]
        elif p['thumbnail']:
            imgs = [p['thumbnail']]
            
        mapped.append({
            "id": p['ml_id'],
            "title": p['title'],
            "price": p['price_web'] if p['price_web'] > 0 else p['price'],
            "original_price": p['price'],
            "images": imgs,
            "description": p['description'],
            "available_quantity": p['available_quantity']
        })
    return mapped
