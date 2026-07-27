from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import json
import urllib.request
import urllib.parse

from src import database
from src.api.auth import verify_session
from src.utils import social_publisher

router = APIRouter()

class GeneratePostRequest(BaseModel):
    product_ml_id: str
    objective: Optional[str] = "promocional"  # promocional, educativo, oferta
    tone: Optional[str] = "entusiasta"        # profesional, entusiasta, divertido

class CreatePostRequest(BaseModel):
    id: Optional[int] = None
    product_ml_id: Optional[str] = None
    title: str
    post_type: str = "post"                   # post, reel, story
    platforms: str = "instagram,facebook"    # instagram,facebook
    caption: str
    media_urls: str                           # URLs separadas por coma
    scheduled_at: Optional[str] = None        # ISO timestamp o None para borrador
    status: str = "draft"                     # draft, scheduled, published

class SaveConfigReq(BaseModel):
    meta_access_token: str
    meta_instagram_account_id: str
    meta_facebook_page_id: str

@router.get("/config")
def get_marketing_config(_=Depends(verify_session)):
    return {
        "meta_access_token": database.get_setting("meta_access_token", ""),
        "meta_instagram_account_id": database.get_setting("meta_instagram_account_id", ""),
        "meta_facebook_page_id": database.get_setting("meta_facebook_page_id", "")
    }

@router.post("/config")
def save_marketing_config(req: SaveConfigReq, _=Depends(verify_session)):
    database.set_setting("meta_access_token", req.meta_access_token.strip())
    database.set_setting("meta_instagram_account_id", req.meta_instagram_account_id.strip())
    database.set_setting("meta_facebook_page_id", req.meta_facebook_page_id.strip())
    return {"success": True, "message": "Configuración de redes sociales guardada exitosamente"}

@router.post("/generate")
def generate_ai_post_copy(req: GeneratePostRequest, _=Depends(verify_session)):
    product = database.get_product_by_ml_id(req.product_ml_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        raise HTTPException(
            status_code=400, 
            detail="Se requiere configurar una clave de API de Gemini en Ajustes de WhatsApp / Chatbot para usar la generación por IA."
        )

    title = product.get("title", "")
    price = product.get("price_web") or product.get("price") or 0
    desc = product.get("description", "")
    category = product.get("category_name", "Insumos para cultivo e hidroponía")

    prompt = f"""
    Eres un experto en Marketing Digital y Community Management especializado en e-commerce y cultivo hidropónico/tradicional en Argentina.
    Crea un post para redes sociales (Instagram/Facebook/Reels) promocionando este producto de la tienda "Hidroponía Rosario":
    - Producto: {title}
    - Precio: ${price:,.2f} ARS
    - Categoría: {category}
    - Detalles/Descripción: {desc}
    - Objetivo de la campaña: {req.objective}
    - Tono de voz: {req.tone}

    Responde en formato JSON estricto con la siguiente estructura:
    {{
        "title": "Un título corto sugerido para la publicación",
        "caption": "El texto completo formateado para Instagram/Facebook con emojis persuasivos, llamado a la acción e información clave",
        "hashtags": "#Hidroponia #Rosario #CultivoEnCasa ...",
        "video_script_idea": "Una breve sugerencia de 3 pasos para grabar un Reel corto de 15 segundos con este producto"
    }}
    Responde ÚNICAMENTE con el objeto JSON válido sin bloques markdown extra.
    """

    models_to_try = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-2.0-flash"]
    last_err = ""

    for model_name in models_to_try:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}]
            }
            data_bytes = json.dumps(payload).encode('utf-8')
            http_req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})

            with urllib.request.urlopen(http_req, timeout=12) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                raw_text = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
                clean_text = raw_text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean_text)
                
                # Combine caption with hashtags
                full_caption = f"{parsed.get('caption', '')}\n\n{parsed.get('hashtags', '')}".strip()

                return {
                    "success": True,
                    "title": parsed.get("title", f"Promoción: {title}"),
                    "caption": full_caption,
                    "video_script_idea": parsed.get("video_script_idea", ""),
                    "images": product.get("images") or product.get("thumbnail") or ""
                }
        except Exception as e:
            last_err = str(e)
            continue

    raise HTTPException(status_code=500, detail=f"Error al generar post con Gemini IA: {last_err}")

@router.get("/posts")
def list_marketing_posts(status: Optional[str] = None, limit: int = 100, _=Depends(verify_session)):
    posts = database.get_marketing_posts(status=status, limit=limit)
    return {"posts": posts}

@router.post("/posts")
def create_or_schedule_post(req: CreatePostRequest, _=Depends(verify_session)):
    status = req.status
    if req.scheduled_at and status != "published":
        status = "scheduled"

    post_data = {
        "product_ml_id": req.product_ml_id,
        "title": req.title,
        "post_type": req.post_type,
        "platforms": req.platforms,
        "caption": req.caption,
        "media_urls": req.media_urls,
        "scheduled_at": req.scheduled_at,
        "status": status
    }
    if req.id:
        database.update_marketing_post(req.id, post_data)
        post_id = req.id
    else:
        post_id = database.create_marketing_post(post_data)
    return {"success": True, "post_id": post_id, "status": status, "message": "Publicación registrada correctamente"}

@router.post("/publish-now/{post_id}")
def publish_post_now(post_id: int, _=Depends(verify_session)):
    post = database.get_marketing_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")

    ok, summary = social_publisher.publish_post_to_all_platforms(post)
    if ok:
        database.update_marketing_post_status(post_id, "published", external_post_id=summary)
        return {"success": True, "message": f"Publicado exitosamente. {summary}"}
    else:
        database.update_marketing_post_status(post_id, "failed", error_message=summary)
        raise HTTPException(status_code=500, detail=f"Error al publicar: {summary}")

@router.delete("/posts/{post_id}")
def delete_marketing_post(post_id: int, _=Depends(verify_session)):
    database.delete_marketing_post(post_id)
    return {"success": True, "message": "Publicación eliminada"}
