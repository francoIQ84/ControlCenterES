from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import json
import urllib.request
import urllib.parse

from src import database
from src.api.auth import verify_session
from src.utils import social_publisher
from src.utils.image_utils import convert_all_images_str, get_high_res_image_url

router = APIRouter()

class GeneratePostRequest(BaseModel):
    product_ml_id: str
    objective: Optional[str] = "promocional"  # promocional, educativo, oferta
    tone: Optional[str] = "entusiasta"        # profesional, entusiasta, divertido

class GenerateVideoRequest(BaseModel):
    product_ml_id: str
    prompt: Optional[str] = ""
    generator_type: Optional[str] = "gemini_canvas" # gemini_canvas, google_veo, pollinations

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
    public_base_url: Optional[str] = None

@router.get("/config")
def get_marketing_config(_=Depends(verify_session)):
    return {
        "meta_access_token": database.get_setting("meta_access_token", ""),
        "meta_instagram_account_id": database.get_setting("meta_instagram_account_id", ""),
        "meta_facebook_page_id": database.get_setting("meta_facebook_page_id", ""),
        "public_base_url": database.get_setting("public_base_url", "")
    }

@router.post("/config")
def save_marketing_config(req: SaveConfigReq, _=Depends(verify_session)):
    database.set_setting("meta_access_token", req.meta_access_token.strip())
    database.set_setting("meta_instagram_account_id", req.meta_instagram_account_id.strip())
    database.set_setting("meta_facebook_page_id", req.meta_facebook_page_id.strip())
    if req.public_base_url:
        database.set_setting("public_base_url", req.public_base_url.strip())
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

                raw_images = product.get("images") or product.get("thumbnail") or ""
                high_res_images = convert_all_images_str(raw_images)

                return {
                    "success": True,
                    "title": parsed.get("title", f"Promoción: {title}"),
                    "caption": full_caption,
                    "video_script_idea": parsed.get("video_script_idea", ""),
                    "images": high_res_images
                }
        except Exception as e:
            last_err = str(e)
            continue

    raise HTTPException(status_code=500, detail=f"Error al generar post con Gemini IA: {last_err}")

@router.post("/generate-video")
def generate_ai_video(req: GenerateVideoRequest, _=Depends(verify_session)):
    product = database.get_product_by_ml_id(req.product_ml_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    from src.utils.video_generator import (
        generate_video_script_with_gemini, 
        generate_video_with_google_veo, 
        generate_video_with_pollinations
    )

    gen_type = (req.generator_type or "gemini_canvas").lower()

    try:
        if gen_type == "google_veo":
            res = generate_video_with_google_veo(req.prompt or f"Reel de {product.get('title')}", product.get("images"))
            if not res.get("success"):
                raise HTTPException(status_code=400, detail=res.get("error", "Error con Google Veo"))
            return res
        elif gen_type == "pollinations":
            res = generate_video_with_pollinations(req.prompt or f"{product.get('title')} hydroponics")
            return res
        else: # gemini_canvas
            script = generate_video_script_with_gemini(product, req.prompt)
            return {
                "success": True,
                "engine": "gemini_canvas",
                "script": script
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar video con IA: {str(e)}")

@router.get("/posts")
def list_marketing_posts(status: Optional[str] = None, limit: int = 100, _=Depends(verify_session)):
    posts = database.get_marketing_posts(status=status, limit=limit)
    return {"posts": posts}

@router.post("/posts")
def create_or_schedule_post(req: CreatePostRequest, _=Depends(verify_session)):
    status = req.status
    if req.scheduled_at and status != "published":
        status = "scheduled"

    clean_media = convert_all_images_str(req.media_urls)

    post_data = {
        "product_ml_id": req.product_ml_id,
        "title": req.title,
        "post_type": req.post_type,
        "platforms": req.platforms,
        "caption": req.caption,
        "media_urls": clean_media,
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

class ReplyCommentRequest(BaseModel):
    platform: str
    comment_id: str
    message: str

class AISuggestReplyRequest(BaseModel):
    comment_text: str
    post_context: Optional[str] = ""
    author_name: Optional[str] = ""

@router.get("/comments")
def get_social_comments(_=Depends(verify_session)):
    comments_data = social_publisher.fetch_recent_social_comments()
    return {"success": True, "data": comments_data}

@router.post("/comments/reply")
def reply_to_social_comment(req: ReplyCommentRequest, _=Depends(verify_session)):
    if req.platform == "instagram":
        ok, res = social_publisher.reply_to_instagram_comment(req.comment_id, req.message)
    elif req.platform == "facebook":
        ok, res = social_publisher.reply_to_facebook_comment(req.comment_id, req.message)
    else:
        raise HTTPException(status_code=400, detail="Plataforma no válida (debe ser instagram o facebook)")

    if ok:
        return {"success": True, "reply_id": res, "message": "Respuesta enviada correctamente"}
    else:
        raise HTTPException(status_code=500, detail=f"Error al enviar respuesta: {res}")

@router.post("/comments/ai-suggest")
def suggest_ai_comment_reply(req: AISuggestReplyRequest, _=Depends(verify_session)):
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        raise HTTPException(
            status_code=400, 
            detail="Se requiere una API Key de Gemini para generar sugerencias."
        )

    prompt = f"""
    Eres el gestor de atención al cliente de "Hidroponía Rosario" (tienda especializada en insumos para cultivo e hidroponía en Argentina).
    Redacta una respuesta amable, profesional, concisa y comercial a este comentario recibido en redes sociales:
    
    - Usuario: {req.author_name or 'Cliente'}
    - Pregunta/Comentario recibido: "{req.comment_text}"
    - Contexto de la publicación: "{req.post_context or ''}"

    Reglas para la respuesta:
    1. Dirígete amablemente al usuario.
    2. Responde directo a la consulta (sobre stock, envíos a todo el país, ubicación en Rosario, asesoramiento).
    3. Incluye emojis sutiles y amigables.
    4. Invítalo a visitar la tienda web (hidroponia.com) o enviar mensaje si requiere ayuda personalizada.
    5. No uses corchetes ni texto descriptivo fuera de la respuesta misma. Responde ÚNICAMENTE con el texto final que se publicará.
    """

    models_to_try = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-2.0-flash"]
    last_err = ""

    for model_name in models_to_try:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            payload = {"contents": [{"parts": [{"text": prompt}]}]}
            data_bytes = json.dumps(payload).encode('utf-8')
            http_req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})

            with urllib.request.urlopen(http_req, timeout=12) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                suggested_text = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
                return {"success": True, "suggested_reply": suggested_text}
        except Exception as e:
            last_err = str(e)
            continue

    raise HTTPException(status_code=500, detail=f"Error al generar sugerencia con Gemini IA: {last_err}")

@router.delete("/posts/{post_id}")
def delete_marketing_post(post_id: int, _=Depends(verify_session)):
    database.delete_marketing_post(post_id)
    return {"success": True, "message": "Publicación eliminada"}

class AutodetectMetaRequest(BaseModel):
    access_token: str

@router.post("/autodetect-meta-credentials")
def autodetect_meta_credentials(req: AutodetectMetaRequest, _=Depends(verify_session)):
    token = req.access_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Por favor ingresa un Access Token de Meta.")

    fb_page_id = ""
    page_token = token

    # 1. Query /me/accounts to find Facebook Pages
    try:
        url = f"https://graph.facebook.com/v19.0/me/accounts?access_token={urllib.parse.quote(token)}"
        req_obj = urllib.request.Request(url)
        with urllib.request.urlopen(req_obj, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get("data", [])
            if pages:
                first_page = pages[0]
                fb_page_id = first_page.get("id")
                if first_page.get("access_token"):
                    page_token = first_page.get("access_token")
            else:
                url_me = f"https://graph.facebook.com/v19.0/me?fields=id,name&access_token={urllib.parse.quote(token)}"
                with urllib.request.urlopen(urllib.request.Request(url_me)) as resp_me:
                    me_data = json.loads(resp_me.read().decode('utf-8'))
                    fb_page_id = me_data.get("id")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al consultar Meta Graph API (/me/accounts): {str(e)}")

    if not fb_page_id:
        raise HTTPException(status_code=400, detail="No se encontró ninguna página de Facebook asociada a este token.")

    # 2. Query /{page_id}?fields=instagram_business_account to find Instagram Business ID
    ig_account_id = ""
    try:
        url_ig = f"https://graph.facebook.com/v19.0/{fb_page_id}?fields=instagram_business_account,name&access_token={urllib.parse.quote(page_token)}"
        with urllib.request.urlopen(urllib.request.Request(url_ig), timeout=12) as resp_ig:
            ig_data = json.loads(resp_ig.read().decode('utf-8'))
            ig_account_id = ig_data.get("instagram_business_account", {}).get("id", "")
    except Exception as e:
        print("Warning fetching IG account ID:", e)

    return {
        "success": True,
        "facebook_page_id": fb_page_id,
        "instagram_account_id": ig_account_id,
        "access_token": page_token,
        "message": f"¡IDs detectados! Facebook Page ID: {fb_page_id} | Instagram Business ID: {ig_account_id or 'No encontrado'}"
    }

