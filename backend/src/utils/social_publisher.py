import json
import time
import urllib.request
import urllib.parse
import urllib.error
from src import database, tenancy
from src.utils.image_utils import get_high_res_image_url

META_GRAPH_API_VERSION = "v19.0"
META_GRAPH_BASE_URL = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}"


def get_user_access_token_from_code(code: str, redirect_uri: str, app_id: str,
                                    app_secret: str) -> dict:
    """Intercambia el código de autorización OAuth de Meta por un User Access Token.

    Llamada server-side:
    GET /oauth/access_token?client_id=...&redirect_uri=...&client_secret=...&code=...
    """
    params = urllib.parse.urlencode({
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "client_secret": app_secret,
        "code": code,
    })
    url = f"{META_GRAPH_BASE_URL}/oauth/access_token?{params}"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "access_token" in data:
                return {
                    "success": True,
                    "access_token": data["access_token"],
                    "token_type": data.get("token_type", "bearer"),
                    "expires_in": data.get("expires_in"),
                }
            return {"success": False, "error": data.get("error", {}).get(
                "message", "Respuesta inesperada de Meta")}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err_data = json.loads(body)
            msg = err_data.get("error", {}).get("message", body)
        except Exception:
            msg = body
        return {"success": False, "error": f"Meta API Error ({e.code}): {msg}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def exchange_for_long_lived_token(short_token: str, app_id: str,
                                  app_secret: str) -> dict:
    """Intercambia un token de corta duración (2 hs) por uno de larga duración (60 días).

    Llamada server-side al endpoint oficial de Meta:
    GET /oauth/access_token?grant_type=fb_exchange_token&...

    Retorna {"access_token": "...", "token_type": "bearer", "expires_in": ...}
    o {"error": "..."} en caso de fallo.
    """
    params = urllib.parse.urlencode({
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": short_token,
    })
    url = f"{META_GRAPH_BASE_URL}/oauth/access_token?{params}"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "access_token" in data:
                return {
                    "success": True,
                    "access_token": data["access_token"],
                    "token_type": data.get("token_type", "bearer"),
                    "expires_in": data.get("expires_in"),
                }
            return {"success": False, "error": data.get("error", {}).get(
                "message", "Respuesta inesperada de Meta")}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err_data = json.loads(body)
            msg = err_data.get("error", {}).get("message", body)
        except Exception:
            msg = body
        return {"success": False, "error": f"Meta API Error ({e.code}): {msg}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_long_lived_page_token(long_lived_user_token: str) -> dict:
    """Obtiene el Page Access Token de larga duración (perpetuo) desde un User Token LL.

    Según la documentación oficial de Meta, un Page Token obtenido desde un
    Long-Lived User Token **no expira nunca** mientras la App siga activa y la
    página no revoque los permisos.

    Retorna {"page_token": "...", "page_id": "...", "page_name": "...",
             "instagram_account_id": "..."} o {"error": "..."}.
    """
    # Paso 1: Obtener las páginas administradas por el usuario
    accounts_url = (f"{META_GRAPH_BASE_URL}/me/accounts"
                    f"?access_token={urllib.parse.quote(long_lived_user_token)}")
    page_token = ""
    page_id = ""
    page_name = ""
    try:
        req = urllib.request.Request(accounts_url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            pages = data.get("data", [])
            if not pages:
                return {"success": False,
                        "error": "No se encontraron páginas de Facebook "
                                 "asociadas a este usuario."}

            page = pages[0]  # Primera página
            page_token = page.get("access_token", "")
            page_id = page.get("id", "")
            page_name = page.get("name", "")
    except urllib.error.HTTPError as e:
        # Fallback: Si /me/accounts falla, verificar si el token ingresado ya es un Page Token directo
        try:
            me_url = (f"{META_GRAPH_BASE_URL}/me"
                      f"?fields=id,name,instagram_business_account"
                      f"&access_token={urllib.parse.quote(long_lived_user_token)}")
            req_me = urllib.request.Request(me_url, method="GET")
            with urllib.request.urlopen(req_me, timeout=12) as resp_me:
                me_data = json.loads(resp_me.read().decode("utf-8"))
                if me_data.get("id"):
                    return {
                        "success": True,
                        "page_token": long_lived_user_token,
                        "page_id": me_data["id"],
                        "page_name": me_data.get("name", ""),
                        "instagram_account_id": me_data.get("instagram_business_account", {}).get("id", ""),
                    }
        except Exception:
            pass

        body = e.read().decode("utf-8", errors="replace")
        try:
            msg = json.loads(body).get("error", {}).get("message", body)
        except Exception:
            msg = body
        if "accounts" in msg or "nonexisting field" in msg:
            msg += ". (En Graph API Explorer, seleccioná 'Token de acceso de usuario' en 'Usuario o página', no la página directamente)."
        return {"success": False, "error": f"Error obteniendo páginas ({e.code}): {msg}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

    # Paso 2: Obtener el Instagram Business Account ID de esa página
    ig_account_id = ""
    if page_id:
        try:
            ig_url = (f"{META_GRAPH_BASE_URL}/{page_id}"
                      f"?fields=instagram_business_account"
                      f"&access_token={urllib.parse.quote(page_token or long_lived_user_token)}")
            req_ig = urllib.request.Request(ig_url, method="GET")
            with urllib.request.urlopen(req_ig, timeout=12) as resp_ig:
                ig_data = json.loads(resp_ig.read().decode("utf-8"))
                ig_account_id = (ig_data.get("instagram_business_account", {})
                                 .get("id", ""))
        except Exception as ig_err:
            print(f"[Meta Token] Warning al obtener IG account ID: {ig_err}")

    return {
        "success": True,
        "page_token": page_token,
        "page_id": page_id,
        "page_name": page_name,
        "instagram_account_id": ig_account_id,
    }

def get_meta_credentials():
    access_token = database.get_setting("meta_access_token", "").strip()
    instagram_id = database.get_setting("meta_instagram_account_id", "").strip()
    page_id = database.get_setting("meta_facebook_page_id", "").strip()
    return {
        "access_token": access_token,
        "instagram_account_id": instagram_id,
        "facebook_page_id": page_id
    }

def wait_for_container_ready(container_id: str, access_token: str, max_wait_sec: int = 60):
    status_url = f"{META_GRAPH_BASE_URL}/{container_id}?fields=status_code,status&access_token={access_token}"
    elapsed = 0
    poll_interval = 3
    while elapsed < max_wait_sec:
        time.sleep(poll_interval)
        elapsed += poll_interval
        try:
            req = urllib.request.Request(status_url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                st_code = res.get("status_code")
                if st_code == "FINISHED":
                    return True, "Ready"
                elif st_code == "ERROR":
                    err_msg = res.get("status", "El procesado del archivo falló en los servidores de Instagram.")
                    return False, f"Instagram rechazó el archivo: {err_msg}"
                elif st_code == "EXPIRED":
                    return False, "El contenedor de Instagram expiró."
        except Exception:
            pass
    return False, f"Tiempo de espera agotado ({max_wait_sec}s) procesando el video/imagen en los servidores de Instagram."

import os
import io
import hashlib
import subprocess
from PIL import Image

def ensure_mp4_h264(local_file_path: str) -> str:
    """
    If the file is a WebM or non-standard format video, uses ffmpeg to encode it to standard H.264 MP4.
    """
    if not os.path.exists(local_file_path):
        return local_file_path

    ext = os.path.splitext(local_file_path)[1].lower()
    mp4_path = os.path.splitext(local_file_path)[0] + "_h264.mp4"
    if local_file_path.endswith("_h264.mp4") and os.path.exists(local_file_path):
        return local_file_path

    try:
        cmd = [
            "ffmpeg", "-y", "-i", local_file_path,
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            mp4_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
        if res.returncode == 0 and os.path.exists(mp4_path) and os.path.getsize(mp4_path) > 0:
            return mp4_path
    except Exception as e:
        print(f"ffmpeg conversion warning: {e}")

    return local_file_path

def ensure_jpeg_image(path_or_url: str) -> str:
    """
    Ensures that local or remote images are converted to a standard RGB JPEG file (.jpg).
    Instagram Graph API strictly requires JPEG format for photo posts.
    Facebook Photos API endpoint accepts JPEG/PNG but rejects WebP.
    """
    if not path_or_url:
        return path_or_url

    clean_path = path_or_url.strip().lstrip("/")

    # Case 1: Local file inside uploads/
    if clean_path.startswith("uploads/"):
        local_disk_path = os.path.abspath(clean_path)
        if not os.path.exists(local_disk_path):
            return path_or_url

        ext = os.path.splitext(local_disk_path)[1].lower()
        if ext in ('.jpg', '.jpeg'):
            return path_or_url

        jpg_path = os.path.splitext(local_disk_path)[0] + "_meta.jpg"
        if os.path.exists(jpg_path) and os.path.getsize(jpg_path) > 0:
            rel = os.path.relpath(jpg_path, os.path.abspath("uploads")).replace("\\", "/")
            return f"/uploads/{rel}"

        try:
            with Image.open(local_disk_path) as img:
                if img.mode in ("RGBA", "LA", "P"):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                    rgb_img = bg
                else:
                    rgb_img = img.convert("RGB")
                rgb_img.save(jpg_path, "JPEG", quality=95, optimize=True)
            rel = os.path.relpath(jpg_path, os.path.abspath("uploads")).replace("\\", "/")
            return f"/uploads/{rel}"
        except Exception as e:
            print(f"Pillow local image conversion warning: {e}")
            return path_or_url

    # Case 2: Remote URL (e.g. Mercado Libre or Tienda Nube .webp or external images)
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        clean_url_path = path_or_url.lower().split('?')[0]
        # If it's already a standard jpg/jpeg from a remote CDN, Meta can fetch it directly
        if clean_url_path.endswith(('.jpg', '.jpeg')):
            return path_or_url

        try:
            # Caché por inquilino: aunque la clave sea el hash de la URL,
            # lo que queda en disco es una copia de la imagen del negocio.
            cache_dir = os.path.abspath(tenancy.tenant_media_dir("social_cache"))
            url_hash = hashlib.md5(path_or_url.encode('utf-8')).hexdigest()
            cached_path = os.path.join(cache_dir, f"{url_hash}.jpg")

            if not (os.path.exists(cached_path) and os.path.getsize(cached_path) > 0):
                req = urllib.request.Request(
                    path_or_url,
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = resp.read()

                with Image.open(io.BytesIO(data)) as img:
                    if img.mode in ("RGBA", "LA", "P"):
                        bg = Image.new("RGB", img.size, (255, 255, 255))
                        if img.mode == "P":
                            img = img.convert("RGBA")
                        bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                        rgb_img = bg
                    else:
                        rgb_img = img.convert("RGB")
                    rgb_img.save(cached_path, "JPEG", quality=95, optimize=True)

            rel = os.path.relpath(cached_path, os.path.abspath("uploads")).replace("\\", "/")
            return f"/uploads/{rel}"
        except Exception as e:
            print(f"Pillow remote image conversion warning: {e}")
            return path_or_url

    return path_or_url

def prepare_media_url_for_meta(raw_url: str) -> str:
    """
    Prepares media URL for Meta Graph API compliance:
    1. Rejects browser-local blob: URLs.
    2. If relative local file, converts WebM/non-H264 video to H.264 MP4 if needed via ffmpeg.
       Converts non-JPEG images (.png, .webp) to standard RGB JPEG via Pillow.
    3. If remote WebP or non-JPEG image, caches and converts it to standard RGB JPEG in uploads/social_cache/.
    4. Builds a fully qualified, public HTTPS URL that Meta servers can download.
    """
    if not raw_url:
        return ""

    url = raw_url.strip()

    # Reject browser-local blob URLs immediately
    if url.startswith("blob:"):
        return ""

    video_exts = ('.mp4', '.mov', '.avi', '.webm', '.mkv')
    clean_no_query = url.lower().split('?')[0]
    is_video = any(clean_no_query.endswith(ext) for ext in video_exts)

    if is_video:
        # Handle local video conversion if relative
        clean_path = url.lstrip("/")
        if clean_path.startswith("uploads/"):
            local_disk_path = os.path.abspath(clean_path)
            if os.path.exists(local_disk_path):
                converted_path = ensure_mp4_h264(local_disk_path)
                rel_path = os.path.relpath(converted_path, os.path.abspath("uploads")).replace("\\", "/")
                url = f"/uploads/{rel_path}"
    else:
        # Convert non-JPEG images (both local and remote) to standard RGB JPEG
        url = ensure_jpeg_image(url)

    # Make fully qualified absolute public URL
    if not (url.startswith("http://") or url.startswith("https://")):
        base_url = database.get_setting("public_base_url", "").strip()
        if not base_url:
            base_url = database.get_setting("storefront_url", "").strip()
        if not base_url:
            base_url = "https://admin.hidroponiarosario.com"

        base_url = base_url.rstrip("/")
        if not base_url.startswith("http"):
            base_url = "https://" + base_url

        if not url.startswith("/"):
            url = "/" + url

        url = f"{base_url}{url}"

    # Meta Graph API strictly requires HTTPS for non-localhost URLs
    if url.startswith("http://") and not ("localhost" in url or "127.0.0.1" in url):
        url = "https://" + url[7:]

    return url

def publish_to_instagram_photo(image_url: str, caption: str):
    image_url = prepare_media_url_for_meta(image_url)
    if not image_url:
        return False, "La imagen no es válida o es una URL de tipo blob local no accesible desde internet."

    creds = get_meta_credentials()
    access_token = creds["access_token"]
    ig_id = creds["instagram_account_id"]

    if not access_token or not ig_id:
        return False, "Credenciales de Instagram no configuradas."

    try:
        # Step 1: Create Media Container
        create_url = f"{META_GRAPH_BASE_URL}/{ig_id}/media"
        params = urllib.parse.urlencode({
            "image_url": image_url,
            "caption": caption,
            "access_token": access_token
        }).encode('utf-8')

        req = urllib.request.Request(create_url, data=params, method="POST")
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            container_id = res_data.get("id")

        if not container_id:
            return False, "No se pudo crear el contenedor de imagen en Instagram."

        # Step 1.5: Wait for container to be ready
        ready_ok, ready_msg = wait_for_container_ready(container_id, access_token, max_wait_sec=20)
        if not ready_ok:
            return False, ready_msg

        # Step 2: Publish Container
        publish_url = f"{META_GRAPH_BASE_URL}/{ig_id}/media_publish"
        params_pub = urllib.parse.urlencode({
            "creation_id": container_id,
            "access_token": access_token
        }).encode('utf-8')

        req_pub = urllib.request.Request(publish_url, data=params_pub, method="POST")
        with urllib.request.urlopen(req_pub) as resp_pub:
            res_pub = json.loads(resp_pub.read().decode('utf-8'))
            post_id = res_pub.get("id")

        if post_id:
            return True, f"Instagram Post ID: {post_id}"
        else:
            return False, "Error al publicar en Instagram."

    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
            err_msg = err_body.get('error', {}).get('message', str(e))
        except Exception:
            err_msg = str(e)
        return False, f"Instagram API Error: {err_msg}"
    except Exception as e:
        return False, f"Error en Instagram API: {str(e)}"

def publish_to_instagram_reel(video_url: str, caption: str):
    video_url = prepare_media_url_for_meta(video_url)
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    ig_id = creds["instagram_account_id"]

    if not access_token or not ig_id:
        return False, "Credenciales de Instagram no configuradas."

    try:
        # Step 1: Create Reel Container
        create_url = f"{META_GRAPH_BASE_URL}/{ig_id}/media"
        params = urllib.parse.urlencode({
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "access_token": access_token
        }).encode('utf-8')

        req = urllib.request.Request(create_url, data=params, method="POST")
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            container_id = res_data.get("id")

        if not container_id:
            return False, "No se pudo crear el contenedor de Reel en Instagram."

        # Step 1.5: Wait for Instagram to download and process/encode the video
        ready_ok, ready_msg = wait_for_container_ready(container_id, access_token, max_wait_sec=60)
        if not ready_ok:
            return False, ready_msg

        # Step 2: Publish Container
        publish_url = f"{META_GRAPH_BASE_URL}/{ig_id}/media_publish"
        params_pub = urllib.parse.urlencode({
            "creation_id": container_id,
            "access_token": access_token
        }).encode('utf-8')

        req_pub = urllib.request.Request(publish_url, data=params_pub, method="POST")
        with urllib.request.urlopen(req_pub) as resp_pub:
            res_pub = json.loads(resp_pub.read().decode('utf-8'))
            post_id = res_pub.get("id")

        if post_id:
            return True, f"Instagram Reel ID: {post_id}"
        else:
            return False, "Error al publicar el Reel en Instagram."

    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
            err_msg = err_body.get('error', {}).get('message', str(e))
        except Exception:
            err_msg = str(e)
        return False, f"Instagram API Error (Reel): {err_msg}"
    except Exception as e:
        return False, f"Error en Instagram API (Reel): {str(e)}"

def publish_to_facebook_page(media_url: str, caption: str, is_video: bool = False):
    media_url = prepare_media_url_for_meta(media_url)
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    page_id = creds["facebook_page_id"].strip() if creds["facebook_page_id"] else "me"

    if not access_token:
        return False, "Credenciales de Facebook Page no configuradas."

    try:
        video_extensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv']
        is_real_video = is_video and media_url and any(media_url.lower().split('?')[0].endswith(ext) for ext in video_extensions)
        if is_real_video and (media_url.startswith("http://") or media_url.startswith("https://")):
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/videos"
            payload = {"file_url": media_url, "description": caption, "access_token": access_token}
        elif media_url and (media_url.startswith("http://") or media_url.startswith("https://")):
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/photos"
            payload = {"url": media_url, "caption": caption, "access_token": access_token}
        else:
            # Feed text-only post fallback (sin links inválidos de imágenes)
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/feed"
            payload = {"message": caption, "access_token": access_token}

        params = urllib.parse.urlencode(payload).encode('utf-8')
        req = urllib.request.Request(post_url, data=params, method="POST")
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            post_id = res_data.get("id") or res_data.get("post_id")

        if post_id:
            return True, f"Facebook Post ID: {post_id}"
        else:
            return False, "Error al publicar en la página de Facebook."
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
            err_msg = err_body.get('error', {}).get('message', str(e))
        except Exception:
            err_msg = str(e)
        return False, f"Facebook API Error: {err_msg}"
    except Exception as e:
        return False, f"Error en Facebook API: {str(e)}"

def publish_post_to_all_platforms(post_data: dict):
    platforms = [p.strip().lower() for p in (post_data.get("platforms") or "instagram,facebook").split(",")]
    post_type = (post_data.get("post_type") or "post").lower()
    from src.utils.marketing_utils import sanitize_marketing_text
    store_name = database.get_merchant_name()
    fiscal_name = (database.get_setting("afip_razon_social") or "").strip()
    caption = sanitize_marketing_text(post_data.get("caption") or "", store_name, fiscal_name)
    raw_media_url = (post_data.get("media_urls") or "").split(",")[0].strip()

    if raw_media_url.startswith("blob:"):
        return False, "Error: La imagen seleccionada es un enlace local temporal (blob) y no fue subida al servidor. Edita la publicación y vuelve a guardar la imagen."

    media_url = prepare_media_url_for_meta(get_high_res_image_url(raw_media_url))

    creds = get_meta_credentials()
    results = []
    successes = 0

    video_extensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv']
    is_real_video = media_url and any(media_url.lower().split('?')[0].endswith(ext) for ext in video_extensions)

    ig_post_id = None
    fb_post_id = None

    if "instagram" in platforms:
        if not creds["instagram_account_id"]:
            results.append("Instagram: Omitido (ID no configurado)")
        else:
            if post_type == "reel" and is_real_video:
                ok, msg = publish_to_instagram_reel(media_url, caption)
            else:
                # If image is provided for a Reel, fallback to Instagram Photo post seamlessly
                ok, msg = publish_to_instagram_photo(media_url, caption)
            if ok:
                successes += 1
                if "Instagram Post ID: " in msg:
                    ig_post_id = msg.replace("Instagram Post ID: ", "").strip()
            results.append(f"Instagram: {'OK' if ok else msg}")

    if "facebook" in platforms:
        if not creds["facebook_page_id"]:
            results.append("Facebook: Omitido (ID no configurado)")
        else:
            is_vid = (post_type == "reel")
            ok, msg = publish_to_facebook_page(media_url, caption, is_video=is_vid)
            if ok:
                successes += 1
                if "Facebook Post ID: " in msg:
                    fb_post_id = msg.replace("Facebook Post ID: ", "").strip()
            results.append(f"Facebook: {'OK' if ok else msg}")

    if post_data.get('id') and (fb_post_id or ig_post_id):
        initial_metrics = {}
        if fb_post_id:
            initial_metrics['facebook'] = {'id': fb_post_id, 'views': 0, 'reach': 0, 'reactions': 0, 'comments': 0, 'shares': 0}
        if ig_post_id:
            initial_metrics['instagram'] = {'id': ig_post_id, 'likes': 0, 'comments': 0}
        try:
            database.update_marketing_post_metrics(post_data['id'], initial_metrics)
        except Exception:
            pass

    overall_ok = (successes > 0)
    summary_msg = " | ".join(results)
    return overall_ok, summary_msg

def reply_to_instagram_comment(comment_id: str, message: str):
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    if not access_token:
        return False, "Credenciales de Meta no configuradas."

    url = f"{META_GRAPH_BASE_URL}/{comment_id}/replies"
    try:
        params = urllib.parse.urlencode({
            "message": message,
            "access_token": access_token
        }).encode('utf-8')
        req = urllib.request.Request(url, data=params, method="POST")
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            reply_id = res_data.get("id")
            if reply_id:
                return True, reply_id
            return False, "No se recibió ID de respuesta de Instagram."
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
            err_msg = err_body.get('error', {}).get('message', str(e))
        except Exception:
            err_msg = str(e)
        return False, f"Instagram API Error: {err_msg}"
    except Exception as e:
        return False, str(e)

def reply_to_facebook_comment(comment_id: str, message: str):
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    if not access_token:
        return False, "Credenciales de Meta no configuradas."

    url = f"{META_GRAPH_BASE_URL}/{comment_id}/comments"
    try:
        params = urllib.parse.urlencode({
            "message": message,
            "access_token": access_token
        }).encode('utf-8')
        req = urllib.request.Request(url, data=params, method="POST")
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            reply_id = res_data.get("id")
            if reply_id:
                return True, reply_id
            return False, "No se recibió ID de respuesta de Facebook."
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
            err_msg = err_body.get('error', {}).get('message', str(e))
        except Exception:
            err_msg = str(e)
        return False, f"Facebook API Error: {err_msg}"
    except Exception as e:
        return False, str(e)

def fetch_recent_social_comments(limit: int = 15):
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    ig_id = creds["instagram_account_id"]
    page_id = creds["facebook_page_id"].strip() if creds["facebook_page_id"] else "me"

    results = {
        "instagram": [],
        "facebook": []
    }

    if not access_token:
        return results

    # 1. Instagram Comments
    if ig_id:
        try:
            ig_url = f"{META_GRAPH_BASE_URL}/{ig_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count&limit={limit}&access_token={access_token}"
            req = urllib.request.Request(ig_url, method="GET")
            with urllib.request.urlopen(req, timeout=12) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                media_list = res_data.get("data", [])

            for item in media_list:
                media_id = item.get("id")
                c_count = item.get("comments_count", 0)
                if c_count > 0 and media_id:
                    comments_url = f"{META_GRAPH_BASE_URL}/{media_id}/comments?fields=id,text,timestamp,username,replies{{id,text,timestamp,username}}&access_token={access_token}"
                    req_c = urllib.request.Request(comments_url, method="GET")
                    try:
                        with urllib.request.urlopen(req_c, timeout=10) as resp_c:
                            c_data = json.loads(resp_c.read().decode('utf-8'))
                            comments = c_data.get("data", [])
                            if comments:
                                results["instagram"].append({
                                    "post_id": media_id,
                                    "caption": item.get("caption", ""),
                                    "media_url": item.get("media_url") or item.get("thumbnail_url") or "",
                                    "permalink": item.get("permalink", ""),
                                    "timestamp": item.get("timestamp"),
                                    "comments": comments
                                })
                    except Exception:
                        pass
        except Exception as e:
            print("Error fetching Instagram comments:", e)

    # 2. Facebook Comments
    if page_id:
        try:
            fb_url = f"{META_GRAPH_BASE_URL}/{page_id}/published_posts?fields=id,message,full_picture,permalink_url,created_time,comments.limit(20){{id,message,created_time,from,comments{{id,message,created_time,from}}}}&limit={limit}&access_token={access_token}"
            req = urllib.request.Request(fb_url, method="GET")
            with urllib.request.urlopen(req, timeout=12) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                posts_list = res_data.get("data", [])

            for item in posts_list:
                comments_obj = item.get("comments", {})
                comments = comments_obj.get("data", []) if isinstance(comments_obj, dict) else []
                if comments:
                    results["facebook"].append({
                        "post_id": item.get("id"),
                        "message": item.get("message", ""),
                        "picture": item.get("full_picture", ""),
                        "permalink": item.get("permalink_url", ""),
                        "created_time": item.get("created_time"),
                        "comments": comments
                    })
        except Exception as e:
            print("Error fetching Facebook comments:", e)

    return results

def fetch_meta_leadgen_forms():
    """Obtiene la lista de formularios de clientes potenciales (Lead Ads) asociados a la página de Facebook."""
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    page_id = creds["facebook_page_id"].strip() if creds["facebook_page_id"] else "me"

    if not access_token:
        return {"success": False, "error": "No se ha configurado el Meta Access Token en el sistema."}

    try:
        url = f"{META_GRAPH_BASE_URL}/{page_id}/leadgen_forms?fields=id,name,status,created_time,leads_count&access_token={access_token}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return {"success": True, "forms": data.get("data", [])}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(body)
            msg = err_json.get("error", {}).get("message", body)
        except Exception:
            msg = body
        print(f"[Meta Leads] HTTPError {e.code}: {msg}")
        return {"success": False, "error": f"Error de Meta API ({e.code}): {msg}"}
    except Exception as e:
        print(f"[Meta Leads] Exception: {e}")
        return {"success": False, "error": str(e)}

def fetch_leads_from_form(form_id: str):
    """Obtiene los clientes potenciales que completaron un formulario de Lead Ads específico."""
    creds = get_meta_credentials()
    access_token = creds["access_token"]

    if not access_token:
        return []

    try:
        url = f"{META_GRAPH_BASE_URL}/{form_id}/leads?fields=id,created_time,field_data,form_id&access_token={access_token}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_leads = data.get("data", [])

        parsed_leads = []
        for item in raw_leads:
            field_data = item.get("field_data", [])
            lead_info = {
                "lead_id": item.get("id"),
                "created_time": item.get("created_time"),
                "source_platform": "INSTAGRAM_ADS"
            }
            notes_parts = []
            
            for field in field_data:
                fname = (field.get("name") or "").lower()
                fvals = field.get("values", [])
                val_str = fvals[0] if fvals else ""

                if any(k in fname for k in ["full_name", "nombre", "first_name", "name"]):
                    lead_info["full_name"] = val_str
                elif any(k in fname for k in ["phone", "telefono", "celular", "whatsapp", "mobile"]):
                    lead_info["phone"] = val_str
                elif any(k in fname for k in ["email", "correo", "mail"]):
                    lead_info["email"] = val_str
                elif any(k in fname for k in ["city", "ciudad", "localidad", "provincia"]):
                    lead_info["city"] = val_str
                else:
                    if val_str:
                        notes_parts.append(f"{field.get('name')}: {val_str}")

            if notes_parts:
                lead_info["notes"] = " | ".join(notes_parts)

            if lead_info.get("full_name") or lead_info.get("phone") or lead_info.get("email"):
                parsed_leads.append(lead_info)

        return parsed_leads
    except Exception as e:
        print(f"[Meta Leads] Error al obtener leads del formulario {form_id}: {e}")
        return []

def fetch_and_sync_all_meta_leads():
    """Descarga e importa todos los leads de formularios de Facebook/Instagram Ads a la base de datos de Clientes."""
    result = fetch_meta_leadgen_forms()
    if not result.get("success"):
        return {
            "success": False,
            "error": result.get("error", "Error al consultar formularios en Meta API")
        }

    forms = result.get("forms", [])
    all_leads = []

    for form in forms:
        form_id = form.get("id")
        if form_id:
            leads = fetch_leads_from_form(form_id)
            all_leads.extend(leads)

    synced = database.sync_meta_leads_bulk(all_leads)
    return {
        "success": True,
        "forms_processed": len(forms),
        "total_leads_found": len(all_leads),
        "synced_count": synced
    }

def sync_social_posts_metrics():
    """
    Sincroniza las métricas (vistas/impresiones, alcance, reacciones/likes, comentarios, shares)
    de las publicaciones recientes en Facebook e Instagram con la tabla marketing_posts del tenant activo.
    """
    import re
    from datetime import datetime

    creds = get_meta_credentials()
    token = creds.get('access_token')
    page_id = creds.get('facebook_page_id')
    ig_id = creds.get('instagram_account_id')

    if not token:
        return {"success": False, "error": "No hay token de Meta configurado", "updated_count": 0}

    # 1. Obtener publicaciones de Facebook
    fb_posts = []
    if page_id:
        try:
            url = f"{META_GRAPH_BASE_URL}/{page_id}/posts?fields=id,message,created_time,shares,comments.summary(true),reactions.summary(true)&limit=100&access_token={urllib.parse.quote(token)}"
            req = urllib.request.Request(url, headers={"User-Agent": "ControlCenterES/1.0"})
            with urllib.request.urlopen(req, timeout=12) as r:
                fb_posts = json.loads(r.read().decode('utf-8')).get('data', [])
        except Exception as e:
            print(f"[Metrics Sync] FB posts err: {e}")

    # Consultar insights de cada post de Facebook
    fb_insights = {}
    for p in fb_posts:
        pid = p['id']
        views = 0
        reach = 0
        clicks = 0
        video_views = 0
        reactions_breakdown = {}

        ins_url = f"{META_GRAPH_BASE_URL}/{pid}/insights?metric=post_media_view,post_total_media_view_unique,post_clicks,post_video_views,post_reactions_by_type_total&access_token={urllib.parse.quote(token)}"
        try:
            req_ins = urllib.request.Request(ins_url, headers={"User-Agent": "ControlCenterES/1.0"})
            with urllib.request.urlopen(req_ins, timeout=5) as ir:
                idata = json.loads(ir.read().decode('utf-8')).get('data', [])
                for item in idata:
                    mname = item.get('name')
                    val = item.get('values', [{}])[0].get('value', 0)
                    if mname == 'post_media_view':
                        views = val if isinstance(val, (int, float)) else 0
                    elif mname == 'post_total_media_view_unique':
                        reach = val if isinstance(val, (int, float)) else 0
                    elif mname == 'post_clicks':
                        clicks = val if isinstance(val, (int, float)) else 0
                    elif mname == 'post_video_views':
                        video_views = val if isinstance(val, (int, float)) else 0
                    elif mname == 'post_reactions_by_type_total' and isinstance(val, dict):
                        reactions_breakdown = val
        except Exception:
            pass

        if views == 0 and video_views > 0:
            views = video_views

        total_reactions = p.get('reactions', {}).get('summary', {}).get('total_count', 0)
        likes_count = reactions_breakdown.get('like', total_reactions)

        fb_insights[pid] = {
            'id': pid,
            'message': p.get('message', ''),
            'created_time': p.get('created_time', ''),
            'views': views,
            'reach': reach,
            'clicks': clicks,
            'reactions': total_reactions,
            'likes': likes_count,
            'comments': p.get('comments', {}).get('summary', {}).get('total_count', 0),
            'shares': p.get('shares', {}).get('count', 0),
        }

    # 2. Obtener medios de Instagram
    ig_media = []
    if ig_id:
        try:
            fields = "id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink"
            url = f"{META_GRAPH_BASE_URL}/{ig_id}/media?fields={fields}&limit=100&access_token={urllib.parse.quote(token)}"
            req_ig = urllib.request.Request(url, headers={"User-Agent": "ControlCenterES/1.0"})
            with urllib.request.urlopen(req_ig, timeout=12) as r:
                ig_media = json.loads(r.read().decode('utf-8')).get('data', [])
        except Exception as e:
            print(f"[Metrics Sync] IG media err: {e}")

    # Intentar obtener insights de IG si el token dispone de ese permiso
    for m in ig_media:
        mid = m['id']
        mtype = m.get('media_type')
        ins_metrics = 'reach,plays,total_interactions' if mtype == 'VIDEO' else 'impressions,reach,total_interactions'
        ins_url = f"{META_GRAPH_BASE_URL}/{mid}/insights?metric={ins_metrics}&access_token={urllib.parse.quote(token)}"
        try:
            req_igi = urllib.request.Request(ins_url, headers={"User-Agent": "ControlCenterES/1.0"})
            with urllib.request.urlopen(req_igi, timeout=4) as ir:
                idata = json.loads(ir.read().decode('utf-8')).get('data', [])
                for item in idata:
                    mname = item.get('name')
                    val = item.get('values', [{}])[0].get('value', 0)
                    if mname in ('impressions', 'plays', 'views') and isinstance(val, (int, float)):
                        m['views'] = val
                    elif mname == 'reach' and isinstance(val, (int, float)):
                        m['reach'] = val
                    elif mname == 'total_interactions' and isinstance(val, (int, float)):
                        m['interactions'] = val
        except Exception:
            pass

    def normalize_text(t):
        if not t:
            return ""
        t = re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]', ' ', t.lower())
        return " ".join(t.split())

    db_posts = database.get_marketing_posts(limit=100)
    updated_count = 0

    for post in db_posts:
        caption_norm = normalize_text(post.get('caption') or '')
        title_norm = normalize_text(post.get('title') or '')
        prefix = caption_norm[:35] if caption_norm else ""
        ext_id = str(post.get('external_post_id') or "")
        existing_metrics = post.get('metrics') or {}

        # 1. Matching Facebook
        matched_fb = None
        saved_fb_id = existing_metrics.get('facebook', {}).get('id')
        if saved_fb_id and saved_fb_id in fb_insights:
            matched_fb = fb_insights[saved_fb_id]
        elif ext_id:
            if "{" in ext_id and "}" in ext_id:
                try:
                    parsed_ext = json.loads(ext_id)
                    cand = parsed_ext.get("facebook_id") or parsed_ext.get("fb_id")
                    if cand and cand in fb_insights:
                        matched_fb = fb_insights[cand]
                except Exception:
                    pass
            if not matched_fb:
                fb_match = re.search(r'Facebook Post ID:\s*([0-9_]+)', ext_id)
                if fb_match:
                    cand = fb_match.group(1).strip()
                    if cand in fb_insights:
                        matched_fb = fb_insights[cand]
                    else:
                        for k in fb_insights:
                            if k.endswith(f"_{cand}") or cand.endswith(f"_{k}"):
                                matched_fb = fb_insights[k]
                                break

        if not matched_fb and prefix:
            for fbid, finfo in fb_insights.items():
                fb_msg_norm = normalize_text(finfo.get('message', ''))
                if not fb_msg_norm:
                    continue
                if prefix in fb_msg_norm or fb_msg_norm[:35] in caption_norm:
                    matched_fb = finfo
                    break

        if not matched_fb and title_norm and len(title_norm) > 10:
            for fbid, finfo in fb_insights.items():
                fb_msg_norm = normalize_text(finfo.get('message', ''))
                if title_norm in fb_msg_norm:
                    matched_fb = finfo
                    break

        # 2. Matching Instagram
        matched_ig = None
        saved_ig_id = existing_metrics.get('instagram', {}).get('id')
        if saved_ig_id:
            for ig_item in ig_media:
                if ig_item.get('id') == saved_ig_id:
                    matched_ig = ig_item
                    break

        if not matched_ig and ext_id:
            if "{" in ext_id and "}" in ext_id:
                try:
                    parsed_ext = json.loads(ext_id)
                    cand = parsed_ext.get("instagram_id") or parsed_ext.get("ig_id")
                    if cand:
                        for ig_item in ig_media:
                            if ig_item.get('id') == cand:
                                matched_ig = ig_item
                                break
                except Exception:
                    pass
            if not matched_ig:
                ig_match = re.search(r'Instagram Post ID:\s*([0-9_]+)', ext_id)
                if ig_match:
                    cand = ig_match.group(1).strip()
                    for ig_item in ig_media:
                        if ig_item.get('id') == cand:
                            matched_ig = ig_item
                            break

        if not matched_ig and prefix:
            for ig_item in ig_media:
                ig_cap_norm = normalize_text(ig_item.get('caption') or '')
                if not ig_cap_norm:
                    continue
                if prefix in ig_cap_norm or ig_cap_norm[:35] in caption_norm:
                    matched_ig = ig_item
                    break

        if not matched_ig and title_norm and len(title_norm) > 10:
            for ig_item in ig_media:
                ig_cap_norm = normalize_text(ig_item.get('caption') or '')
                if title_norm in ig_cap_norm:
                    matched_ig = ig_item
                    break

        metrics = {}
        if matched_fb:
            metrics['facebook'] = {
                'id': matched_fb['id'],
                'views': matched_fb.get('views', 0),
                'reach': matched_fb.get('reach', 0),
                'reactions': matched_fb.get('reactions', 0),
                'likes': matched_fb.get('likes', matched_fb.get('reactions', 0)),
                'comments': matched_fb.get('comments', 0),
                'shares': matched_fb.get('shares', 0),
                'clicks': matched_fb.get('clicks', 0),
            }
        elif existing_metrics.get('facebook'):
            # Conservar métricas previas si ya existían para no borrar histórico
            metrics['facebook'] = existing_metrics['facebook']

        if matched_ig:
            metrics['instagram'] = {
                'id': matched_ig['id'],
                'likes': matched_ig.get('like_count', 0),
                'comments': matched_ig.get('comments_count', 0),
                'permalink': matched_ig.get('permalink', ''),
                'media_type': matched_ig.get('media_type', 'IMAGE'),
            }
            if 'views' in matched_ig:
                metrics['instagram']['views'] = matched_ig['views']
            if 'reach' in matched_ig:
                metrics['instagram']['reach'] = matched_ig['reach']
        elif existing_metrics.get('instagram'):
            # Conservar métricas previas si ya existían
            metrics['instagram'] = existing_metrics['instagram']

        if metrics:
            database.update_marketing_post_metrics(post['id'], metrics)
            updated_count += 1

    # Registrar fecha y hora de la última sincronización en settings del inquilino
    now_iso = datetime.now().isoformat()
    try:
        database.set_setting("meta_metrics_last_synced_at", now_iso)
    except Exception as e:
        print(f"[Metrics Sync] Error guardando meta_metrics_last_synced_at: {e}")

    return {"success": True, "updated_count": updated_count, "last_synced_at": now_iso}


def check_and_sync_social_metrics_if_due(tenant=None):
    """
    Verifica si corresponde sincronizar métricas de Meta para el tenant actual.
    Se ejecuta de forma periódica en el scheduler del VPS (al menos una vez al día o cada 12 horas).
    """
    from datetime import datetime

    creds = get_meta_credentials()
    if not creds.get("access_token"):
        return {"synced": False, "reason": "no_credentials"}

    interval_hours = 12
    try:
        interval_hours = int(database.get_setting("meta_metrics_sync_interval_hours", "12"))
    except Exception:
        interval_hours = 12

    last_synced = database.get_setting("meta_metrics_last_synced_at", "")
    now = datetime.now()

    if last_synced:
        try:
            last_dt = datetime.fromisoformat(last_synced)
            elapsed_seconds = (now - last_dt).total_seconds()
            # Si transcurrió menos del intervalo y sigue siendo el mismo día calendario, omitir
            if elapsed_seconds < (interval_hours * 3600) and last_dt.date() == now.date():
                return {
                    "synced": False,
                    "reason": "already_synced_recently",
                    "elapsed_seconds": elapsed_seconds,
                    "last_synced_at": last_synced
                }
        except Exception:
            pass

    slug = (tenant or {}).get("slug", "unknown")
    print(f"[Scheduler-Marketing][{slug}] Ejecutando sincronización automática de métricas de Facebook e Instagram...")
    res = sync_social_posts_metrics()
    return {
        "synced": True,
        "updated_count": res.get("updated_count", 0),
        "last_synced_at": res.get("last_synced_at", now.isoformat())
    }

