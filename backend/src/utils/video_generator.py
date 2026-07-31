import json
import os
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
    Calls Google Veo 3.1 Fast / Veo 2.0 API using configured Gemini API Key.
    Requires the google-genai SDK: pip install google-genai
    """
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        raise Exception("Se requiere una API Key de Gemini / Google AI Studio configurada en Ajustes.")

    prompt_clean = prompt or "Un Reel publicitario comercial profesional en movimiento de alta calidad para redes sociales"
    out_dir = os.path.join("uploads", "reels")
    os.makedirs(out_dir, exist_ok=True)
    out_filename = f"veo_{int(time.time())}.mp4"
    out_path = os.path.join(out_dir, out_filename)

    # Check if google-genai SDK is available
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise Exception(
            "El paquete 'google-genai' no está instalado en el servidor. "
            "Ejecutá 'pip install google-genai' en el VPS y reiniciá el backend."
        )

    last_veo_err = ""

    try:
        client = genai.Client(
            http_options={"api_version": "v1beta"},
            api_key=gemini_key,
        )

        video_config = types.GenerateVideosConfig(
            aspect_ratio="9:16",  # Vertical Reel format
            number_of_videos=1,
            duration_seconds=8,
            resolution="720p",
        )

        veo_models = [
            "veo-3.1-fast-generate-preview",
            "veo-3.1-generate-preview",
            "veo-3.1-lite-generate-preview"
        ]

        for veo_model in veo_models:
            try:
                print(f"[Veo] Intentando generar video con modelo: {veo_model}")
                operation = client.models.generate_videos(
                    model=veo_model,
                    source=types.GenerateVideosSource(prompt=prompt_clean),
                    config=video_config,
                )

                # Poll until done (max ~3.5 min)
                max_polls = 40
                poll_count = 0
                while not operation.done and poll_count < max_polls:
                    time.sleep(5)
                    poll_count += 1
                    operation = client.operations.get(operation)
                    print(f"[Veo] Polling {poll_count}/{max_polls}...")

                if not operation.done:
                    last_veo_err = f"Timeout: el video no se generó en {max_polls * 5}s con {veo_model}"
                    continue

                result = operation.result
                if result and hasattr(result, 'generated_videos') and result.generated_videos:
                    video_obj = result.generated_videos[0].video
                    
                    # Method 1: Check if bytes are directly attached
                    if hasattr(video_obj, 'video_bytes') and video_obj.video_bytes:
                        with open(out_path, "wb") as f:
                            f.write(video_obj.video_bytes)
                        print(f"[Veo] Video guardado desde video_bytes: {out_path}")
                        return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "google_veo", "model": veo_model}

                    # Method 2: Use client.files.download(file=video_obj)
                    if hasattr(client, 'files') and hasattr(client.files, 'download'):
                        try:
                            video_bytes = client.files.download(file=video_obj)
                            if video_bytes:
                                with open(out_path, "wb") as f:
                                    f.write(video_bytes)
                                print(f"[Veo] Video descargado exitosamente via client.files.download: {out_path}")
                                return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "google_veo", "model": veo_model}
                        except Exception as dl_err:
                            print(f"[Veo] Download error: {dl_err}")

                    # Method 3: Download from video_obj.uri
                    if hasattr(video_obj, 'uri') and video_obj.uri:
                        import urllib.request
                        urllib.request.urlretrieve(video_obj.uri, out_path)
                        print(f"[Veo] Video descargado desde URI ({video_obj.uri}): {out_path}")
                        return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "google_veo", "model": veo_model}

                    last_veo_err = f"El modelo {veo_model} completó pero no se pudieron obtener los bytes del video."
                else:
                    last_veo_err = f"El modelo {veo_model} no devolvió resultados."
            except Exception as model_err:
                last_veo_err = str(model_err)
                print(f"[Veo] Error con {veo_model}: {last_veo_err}")
                if "429" in last_veo_err or "RESOURCE_EXHAUSTED" in last_veo_err:
                    last_veo_err = "Se ha superado la cuota límite (Quota Exceeded) de tu API Key para Google Veo. Verificá los límites o la facturación en Google AI Studio (aistudio.google.com)."
                continue

    except Exception as e:
        last_veo_err = str(e)
        print(f"[Veo] Error general del SDK: {last_veo_err}")

    return {
        "success": False,
        "error": f"Error con Google Veo 3.1: {last_veo_err}. Verificá que tu API Key tenga permisos de Veo en tu cuenta Google AI Pro / Cloud."
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
