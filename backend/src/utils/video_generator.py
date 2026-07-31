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
    Calls Google Veo API using configured Gemini API Key.
    Auto-discovers available Veo models from the API key.
    """
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        raise Exception("Se requiere una API Key de Gemini / Google AI Studio configurada en Ajustes.")

    prompt_clean = prompt or "Un Reel publicitario comercial profesional en movimiento de alta calidad para redes sociales"
    out_dir = os.path.join("uploads", "reels")
    os.makedirs(out_dir, exist_ok=True)
    out_filename = f"veo_{int(time.time())}.mp4"
    out_path = os.path.join(out_dir, out_filename)

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise Exception(
            "El paquete 'google-genai' no está instalado en el servidor. "
            "Ejecutá 'pip install google-genai' en el VPS y reiniciá el backend."
        )

    all_errors = []

    try:
        client = genai.Client(
            http_options={"api_version": "v1beta"},
            api_key=gemini_key,
        )

        # Auto-discover available Veo models from the API key
        discovered_veo_models = []
        try:
            for m in client.models.list():
                model_id = m.name.replace("models/", "") if m.name.startswith("models/") else m.name
                if "veo" in model_id.lower():
                    discovered_veo_models.append(model_id)
                    print(f"[Veo] Modelo Veo descubierto: {model_id}")
        except Exception as list_err:
            print(f"[Veo] Error listando modelos: {list_err}")

        # Hardcoded fallback list if discovery fails
        fallback_models = [
            "veo-2.0-generate-001",
            "veo-3.1-fast-generate-preview",
            "veo-3.1-generate-preview",
            "veo-2.0-generate-preview",
        ]

        # Use discovered models first, then fallback, removing duplicates
        veo_models = discovered_veo_models.copy()
        for fm in fallback_models:
            if fm not in veo_models:
                veo_models.append(fm)

        if not veo_models:
            return {
                "success": False,
                "error": "No se encontraron modelos Veo disponibles con tu API Key. "
                         "Verificá que tu cuenta Google AI tenga acceso a Veo en aistudio.google.com."
            }

        print(f"[Veo] Modelos a probar (descubiertos + fallback): {veo_models}")

        video_config = types.GenerateVideosConfig(
            aspect_ratio="9:16",
            number_of_videos=1,
            duration_seconds=8,
        )

        for veo_model in veo_models:
            try:
                print(f"[Veo] Intentando generar video con modelo: {veo_model}")

                # Try prompt= first, then source= syntax
                operation = None
                for call_style in ["prompt", "source"]:
                    try:
                        if call_style == "prompt":
                            operation = client.models.generate_videos(
                                model=veo_model,
                                prompt=prompt_clean,
                                config=video_config,
                            )
                        else:
                            operation = client.models.generate_videos(
                                model=veo_model,
                                source=types.GenerateVideosSource(prompt=prompt_clean),
                                config=video_config,
                            )
                        break  # If no exception, we have an operation
                    except TypeError:
                        continue  # Wrong call signature, try the other

                if operation is None:
                    all_errors.append(f"{veo_model}: no se pudo invocar generate_videos")
                    continue

                # Poll until done (max ~3.5 min)
                max_polls = 40
                poll_count = 0
                while not operation.done and poll_count < max_polls:
                    time.sleep(5)
                    poll_count += 1
                    operation = client.operations.get(operation)
                    print(f"[Veo] Polling {poll_count}/{max_polls}...")

                if not operation.done:
                    all_errors.append(f"{veo_model}: timeout ({max_polls * 5}s)")
                    continue

                result = operation.result
                if result and hasattr(result, 'generated_videos') and result.generated_videos:
                    video_obj = result.generated_videos[0].video

                    # Method 1: video_bytes
                    if hasattr(video_obj, 'video_bytes') and video_obj.video_bytes:
                        with open(out_path, "wb") as f:
                            f.write(video_obj.video_bytes)
                        print(f"[Veo] Video guardado desde video_bytes: {out_path}")
                        return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "google_veo", "model": veo_model}

                    # Method 2: client.files.download
                    if hasattr(client, 'files') and hasattr(client.files, 'download'):
                        try:
                            video_bytes = client.files.download(file=video_obj)
                            if video_bytes:
                                with open(out_path, "wb") as f:
                                    f.write(video_bytes)
                                print(f"[Veo] Video descargado via client.files.download: {out_path}")
                                return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "google_veo", "model": veo_model}
                        except Exception as dl_err:
                            print(f"[Veo] Download error: {dl_err}")

                    # Method 3: URI download
                    if hasattr(video_obj, 'uri') and video_obj.uri:
                        import urllib.request
                        urllib.request.urlretrieve(video_obj.uri, out_path)
                        print(f"[Veo] Video descargado desde URI: {out_path}")
                        return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "google_veo", "model": veo_model}

                    all_errors.append(f"{veo_model}: completó pero no se pudieron obtener bytes del video")
                else:
                    all_errors.append(f"{veo_model}: no devolvió resultados")
            except Exception as model_err:
                err_str = str(model_err)
                all_errors.append(f"{veo_model}: {err_str[:200]}")
                print(f"[Veo] Error con {veo_model}: {err_str}")
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    return {
                        "success": False,
                        "error": "Se ha superado la cuota límite (Quota Exceeded) de tu API Key para Google Veo. "
                                 "Verificá los límites o la facturación en Google AI Studio (aistudio.google.com)."
                    }
                continue

    except Exception as e:
        all_errors.append(f"Error general SDK: {str(e)}")
        print(f"[Veo] Error general del SDK: {e}")

    discovered_info = f" Modelos Veo descubiertos: {discovered_veo_models}" if discovered_veo_models else " No se descubrieron modelos Veo con tu API Key."
    errors_summary = " | ".join(all_errors[-3:]) if all_errors else "sin detalle"
    return {
        "success": False,
        "error": f"Error con Google Veo.{discovered_info} Errores: {errors_summary}. "
                 f"Verificá que tu API Key tenga acceso a Veo en aistudio.google.com."
    }

def generate_video_with_flux(prompt: str, post_type: str = "reel", product_data: dict = None):
    """
    Uses FLUX.1 Realism AI model (Ultra-realistic HD free generation).
    Supports post_type='post' (1:1 1080x1080) and post_type='reel' (9:16 1080x1920).
    Automatically includes product context to generate accurate product shots.
    """
    try:
        title = product_data.get("title", "") if isinstance(product_data, dict) else ""
        
        base_prompt = f"professional product photography of {title}, hydroponics commercial kit bottles, clean studio lighting, 8k resolution, photorealistic" if title else "hydroponics plant growth commercial product photo ultra realistic 8k"
        if prompt and prompt.strip():
            base_prompt += f", {prompt.strip()}"

        encoded_prompt = urllib.parse.quote(base_prompt)
        seed = int(time.time())
        is_post = (post_type or "").lower() == "post"
        width = 1080
        height = 1080 if is_post else 1920
        flux_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?model=flux-realism&width={width}&height={height}&seed={seed}&nologo=true"
        return {
            "success": True,
            "video_url": flux_url,
            "engine": "flux"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def generate_video_with_imagen3(prompt: str, post_type: str = "reel"):
    """
    Uses Google Imagen 3.0 via Gemini API Key for ultra-high quality visuals.
    """
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        return {"success": False, "error": "Se requiere una API Key de Gemini configurada en Ajustes."}

    is_post = (post_type or "").lower() == "post"
    aspect_ratio = "1:1" if is_post else "9:16"
    prompt_clean = prompt or "hydroponic system commercial product photography, 8k, cinematic, photorealistic"

    # Try SDK first
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        for model_name in ["imagen-4.0-generate-001", "imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"]:
            try:
                result = client.models.generate_images(
                    model=model_name,
                    prompt=prompt_clean,
                    config=types.GenerateImagesConfig(
                        number_of_images=1,
                        aspect_ratio=aspect_ratio,
                    )
                )
                if result and hasattr(result, 'generated_images') and result.generated_images:
                    img_obj = result.generated_images[0].image
                    img_bytes = getattr(img_obj, 'image_bytes', None) or getattr(img_obj, 'bytes', None)
                    if img_bytes:
                        out_dir = os.path.join("uploads", "reels")
                        os.makedirs(out_dir, exist_ok=True)
                        out_filename = f"imagen3_{int(time.time())}.png"
                        out_path = os.path.join(out_dir, out_filename)
                        with open(out_path, "wb") as f:
                            f.write(img_bytes)
                        return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "imagen3"}
            except Exception as e:
                print(f"[Imagen3] SDK error with {model_name}: {e}")
                continue
    except Exception as e:
        print(f"[Imagen3] SDK init error: {e}")

    # Fallback to REST API
    try:
        import requests
        for model_name in ["imagen-4.0-generate-001", "imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict?key={gemini_key}"
                headers = {"Content-Type": "application/json"}
                payload = {
                    "instances": [{"prompt": prompt_clean}],
                    "parameters": {"sampleCount": 1, "aspectRatio": aspect_ratio}
                }
                res = requests.post(url, json=payload, headers=headers, timeout=20)
                if res.status_code == 200:
                    data = res.json()
                    predictions = data.get("predictions", [])
                    if predictions and "bytesBase64Encoded" in predictions[0]:
                        import base64
                        img_bytes = base64.b64decode(predictions[0]["bytesBase64Encoded"])
                        out_dir = os.path.join("uploads", "reels")
                        os.makedirs(out_dir, exist_ok=True)
                        out_filename = f"imagen3_{int(time.time())}.png"
                        out_path = os.path.join(out_dir, out_filename)
                        with open(out_path, "wb") as f:
                            f.write(img_bytes)
                        return {"success": True, "video_url": f"/uploads/reels/{out_filename}", "engine": "imagen3"}
            except Exception:
                continue
    except Exception:
        pass

    return {
        "success": False,
        "error": "No se pudo generar la imagen con Google Imagen 3. Verificá tu API Key de Gemini."
    }

def generate_video_with_pollinations(prompt: str, post_type: str = "reel"):
    """
    Uses FLUX Realism free endpoint.
    """
    return generate_video_with_flux(prompt, post_type=post_type)


def generate_image_with_gemini_native(prompt: str, product_data: dict, post_type: str = "post"):
    """
    Uses Google Imagen 3.0 via google-genai SDK or REST API to create a real AI image based on user's prompt.
    If Imagen 3 is unavailable on the API key, falls back to the Gemini Canvas script.
    """
    gemini_key = database.get_setting("gemini_api_key", "").strip()
    if not gemini_key:
        return {"success": False, "error": "Se requiere una API Key de Gemini configurada en Ajustes."}

    title = product_data.get("title", "")
    price = product_data.get("price_web") or product_data.get("price") or 0

    full_prompt = (
        f"Professional high quality promotional social media product photography "
        f"for {title} from Hidroponía Rosario. Price ${price:,.0f} ARS. "
    )
    if prompt and prompt.strip():
        full_prompt += f"User instructions: {prompt}. "
    full_prompt += "Photorealistic, 8k, commercial product shot."

    is_post = (post_type or "").lower() == "post"
    aspect_ratio = "1:1" if is_post else "9:16"

    # Method 1: Try via google-genai SDK generate_images
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        for model_name in ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"]:
            try:
                print(f"[Imagen3SDK] Generating image with {model_name}...")
                result = client.models.generate_images(
                    model=model_name,
                    prompt=full_prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=1,
                        aspect_ratio=aspect_ratio,
                    )
                )
                if result and hasattr(result, 'generated_images') and result.generated_images:
                    img_obj = result.generated_images[0].image
                    img_bytes = getattr(img_obj, 'image_bytes', None) or getattr(img_obj, 'bytes', None)
                    if img_bytes:
                        out_dir = os.path.join("uploads", "reels")
                        os.makedirs(out_dir, exist_ok=True)
                        out_filename = f"imagen3_{int(time.time())}.png"
                        out_path = os.path.join(out_dir, out_filename)
                        with open(out_path, "wb") as f:
                            f.write(img_bytes)
                        print(f"[Imagen3SDK] SUCCESS: {out_path}")
                        return {
                            "success": True,
                            "video_url": f"/uploads/reels/{out_filename}",
                            "engine": "imagen3"
                        }
            except Exception as model_err:
                print(f"[Imagen3SDK] Error with {model_name}: {model_err}")
                continue
    except Exception as sdk_err:
        print(f"[Imagen3SDK] General SDK error: {sdk_err}")

    # Method 2: Try via REST API
    try:
        import requests
        for model_name in ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict?key={gemini_key}"
                headers = {"Content-Type": "application/json"}
                payload = {
                    "instances": [{"prompt": full_prompt}],
                    "parameters": {"sampleCount": 1, "aspectRatio": aspect_ratio}
                }
                res = requests.post(url, json=payload, headers=headers, timeout=20)
                if res.status_code == 200:
                    data = res.json()
                    predictions = data.get("predictions", [])
                    if predictions and "bytesBase64Encoded" in predictions[0]:
                        import base64
                        img_bytes = base64.b64decode(predictions[0]["bytesBase64Encoded"])
                        out_dir = os.path.join("uploads", "reels")
                        os.makedirs(out_dir, exist_ok=True)
                        out_filename = f"imagen3_{int(time.time())}.png"
                        out_path = os.path.join(out_dir, out_filename)
                        with open(out_path, "wb") as f:
                            f.write(img_bytes)
                        print(f"[Imagen3REST] SUCCESS: {out_path}")
                        return {
                            "success": True,
                            "video_url": f"/uploads/reels/{out_filename}",
                            "engine": "imagen3"
                        }
                else:
                    print(f"[Imagen3REST] {model_name} returned status {res.status_code}: {res.text}")
            except Exception as rest_err:
                print(f"[Imagen3REST] Error: {rest_err}")
                continue
    except Exception as e:
        print(f"[Imagen3REST] General error: {e}")

    # Fallback to Gemini Canvas script generation (never crashes with 404)
    print("[GeminiNativeImg] Imagen 3 non-responsive or quota limited. Falling back to Canvas Template script.")
    script = generate_video_script_with_gemini(product_data, prompt)
    return {
        "success": True,
        "engine": "gemini_canvas",
        "script": script
    }

