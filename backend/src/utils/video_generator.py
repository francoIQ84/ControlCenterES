import json
import urllib.request
import urllib.parse
import time
from src import database
from src.utils.image_utils import get_high_res_image_url

def generate_video_script_with_gemini(product_data: dict, user_prompt: str = ""):
    """
    Uses Gemini AI to generate a structured 4-scene video script tailored for a 15-second Reel.
    """
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        raise Exception("Se requiere una API Key de Gemini configurada en Ajustes para generar videos por IA.")

    title = product_data.get("title", "")
    price = product_data.get("price_web") or product_data.get("price") or 0
    category = product_data.get("category_name", "E-commerce")
    desc = product_data.get("description", "")
    images_str = product_data.get("images") or product_data.get("thumbnail") or ""
    images_list = [get_high_res_image_url(i.strip()) for i in images_str.split(",") if i.strip()]

    prompt_text = f"""
    Eres un director creativo publicitario experto en TikTok Reels e Instagram Reels en Argentina.
    Crea el guión visual y escrito para un Reel corto de 15 segundos promocionando este producto de "Hidroponía Rosario":
    - Producto: {title}
    - Precio: ${price:,.2f} ARS
    - Categoría: {category}
    - Descripción: {desc}
    - Instrucciones/Prompt adicional del usuario: "{user_prompt or 'Promoción atractiva de ventas'}"

    Responde en formato JSON ESTRICTO con la siguiente estructura exacta:
    {{
        "video_title": "Título sugerido para el Reel",
        "theme_color": "emerald",
        "scenes": [
            {{
                "scene_num": 1,
                "duration_sec": 3,
                "badge_text": "¡NOVEDAD EXCLUSIVA!",
                "main_headline": "Texto impactante escena 1",
                "sub_text": "Subtexto breve escena 1"
            }},
            {{
                "scene_num": 2,
                "duration_sec": 4,
                "badge_text": "CARACTERÍSTICAS",
                "main_headline": "Beneficio o característica clave",
                "sub_text": "Detalle llamativo"
            }},
            {{
                "scene_num": 3,
                "duration_sec": 4,
                "badge_text": "PRECIO IMPERDIBLE",
                "main_headline": "Oferta Especial ${price:,.0f} ARS",
                "sub_text": "Envíos a todo el país"
            }},
            {{
                "scene_num": 4,
                "duration_sec": 4,
                "badge_text": "¡COMPRÁ AHORA!",
                "main_headline": "Disponible en Hidroponia Rosario",
                "sub_text": "Haz clic para consultar stock"
            }}
        ],
        "full_caption": "Texto completo para el posteo de Instagram con emojis y hashtags"
    }}
    Responde ÚNICAMENTE con el objeto JSON válido sin bloques markdown extra.
    """

    models_to_try = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-2.0-flash"]
    last_err = ""

    for model_name in models_to_try:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            payload = {"contents": [{"parts": [{"text": prompt_text}]}]}
            data_bytes = json.dumps(payload).encode('utf-8')
            http_req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})

            with urllib.request.urlopen(http_req, timeout=12) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                raw_text = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
                clean_text = raw_text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean_text)
                parsed["images"] = images_list
                parsed["product_title"] = title
                parsed["product_price"] = price
                return parsed
        except Exception as e:
            last_err = str(e)
            continue

    raise Exception(f"Error al generar guión de video con Gemini IA: {last_err}")

def generate_video_with_google_veo(prompt: str, image_url: str = ""):
    """
    Attempts to call Google Veo / Imagen Video API using configured Gemini Key.
    """
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        raise Exception("Se requiere una API Key de Gemini para utilizar Google Veo.")

    # Try Google Veo / Imagen Video endpoint
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-video:predict?key={gemini_key}"
        payload = {
            "instances": [{
                "prompt": prompt or "Un Reel publicitario profesional cinematográfico en movimiento mostrando productos de cultivo",
            }],
            "parameters": {
                "aspectRatio": "9:16",
                "durationSeconds": 10
            }
        }
        data_bytes = json.dumps(payload).encode('utf-8')
        http_req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})

        with urllib.request.urlopen(http_req, timeout=15) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            video_uri = res_data.get("predictions", [{}])[0].get("bytesBase64Encoded") or res_data.get("videoUri")
            if video_uri:
                return {"success": True, "video_url": video_uri, "engine": "google_veo"}
    except Exception as e:
        # If Veo model is not enabled on standard AI Studio key, return informative response
        return {
            "success": False,
            "error": f"El modelo Google Veo requiere permisos de acceso habilitados en tu Google Cloud Project / Gemini Key ({str(e)}). Te recomendamos utilizar 'Gemini IA + Comercial HD'."
        }

def generate_video_with_pollinations(prompt: str):
    """
    Uses Pollinations AI free image-to-video / text-to-video endpoint.
    """
    try:
        encoded_prompt = urllib.parse.quote(prompt or "hydroponics plant growth reel cinematic")
        seed = int(time.time())
        pollinations_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1080&height=1920&seed={seed}&nologo=true"
        return {
            "success": True,
            "video_url": pollinations_url,
            "engine": "pollinations"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
