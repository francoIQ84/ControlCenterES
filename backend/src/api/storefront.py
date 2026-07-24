from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List
from src import database

router = APIRouter()

@router.get("/products")
def get_storefront_products(category: str = None):
    # Only return products that are active for the web, potentially filtered by category slug
    products = database.get_all_products(is_web_active=1, category_slug=category)
    
    mapped = []
    for p in products:
        imgs = []
        if p['images']:
            imgs = [i.strip().replace('-I.jpg', '-O.jpg') for i in p['images'].split(',') if i.strip()]
        elif p['thumbnail']:
            imgs = [p['thumbnail'].replace('-I.jpg', '-O.jpg')]
            
        mapped.append({
            "id": p['ml_id'],
            "title": p['title'],
            "price": p['price_web'] if p['price_web'] > 0 else p['price'],
            "original_price": p['price'],
            "images": imgs,
            "description": p['description'],
            "available_quantity": p['available_quantity'],
            "category_id": p.get('category_id'),
            "category_name": p.get('category_name'),
            "category_slug": p.get('category_slug'),
            "permalink": p.get('permalink'),
            "status": p.get('status')
        })
    return mapped

@router.get("/categories")
def get_storefront_categories():
    return database.get_all_categories()

@router.get("/config")
def get_storefront_config():
    import json
    cfg_str = database.get_setting("web_config")
    cfg = {}
    if cfg_str:
        try:
            cfg = json.loads(cfg_str)
        except Exception:
            pass
            
    contact_phone = cfg.get("contact_phone", "").strip() or database.get_setting("whatsapp_phone", "").strip()
    
    return {
        "store_name": cfg.get("store_name", "Tienda Oficial"),
        "logo_url": cfg.get("logo_url", ""),
        "hero_title": cfg.get("hero_title", "Nuestra Tienda Oficial"),
        "hero_subtitle": cfg.get("hero_subtitle", "Los mejores productos directo de fábrica, al mejor precio."),
        "hero_image": cfg.get("hero_image", ""),
        "contact_phone": contact_phone,
        "address": cfg.get("address", ""),
        "footer_text": cfg.get("footer_text", "© 2026 ControlCenterES. Todos los derechos reservados."),
        "about_us_enabled": database.get_setting("about_us_enabled", "1") == "1",
        "blog_enabled": database.get_setting("blog_enabled", "1") == "1"
    }

@router.get("/about")
def get_storefront_about():
    return {
        "enabled": database.get_setting("about_us_enabled", "1") == "1",
        "title": database.get_setting("about_us_title", "Sobre Nosotros"),
        "content": database.get_setting("about_us_content", "Somos una empresa especializada en insumos para cultivos tradicionales e hidropónicos en Rosario."),
        "images": database.get_setting("about_us_images", "")
    }

@router.get("/blog")
def get_storefront_blog():
    if database.get_setting("blog_enabled", "1") != "1":
        return []
    return database.get_all_blog_posts(is_published_only=True)

@router.get("/blog/{slug}")
def get_storefront_blog_post(slug: str):
    if database.get_setting("blog_enabled", "1") != "1":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="El blog se encuentra desactivado temporariamente")
    post = database.get_blog_post_by_slug(slug)
    if not post or post.get("is_published") != 1:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    return post

@router.post("/products/{product_id}/visit")
def record_product_visit(product_id: str, request: Request, domain: str = None, ip: str = None):
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    client_ip = ip
    if not client_ip:
        if x_forwarded_for:
            client_ip = x_forwarded_for.split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"
            
    client_domain = domain or request.headers.get("host", "hidroponiarosario.com")
    if client_domain and ":" in client_domain:
        client_domain = client_domain.split(":")[0]
        
    database.increment_product_web_visits(product_id, client_domain, client_ip)
    return {"status": "ok"}
