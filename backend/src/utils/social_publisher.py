import json
import time
import urllib.request
import urllib.parse
import urllib.error
from src import database

META_GRAPH_API_VERSION = "v19.0"
META_GRAPH_BASE_URL = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}"

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

def publish_to_instagram_photo(image_url: str, caption: str):
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
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    page_id = creds["facebook_page_id"].strip() if creds["facebook_page_id"] else "me"

    if not access_token:
        return False, "Credenciales de Facebook Page no configuradas."

    try:
        is_real_video = is_video and media_url and any(media_url.lower().split('?')[0].endswith(ext) for ext in ['.mp4', '.mov', '.avi', '.webm', '.mkv'])
        if is_real_video and (media_url.startswith("http://") or media_url.startswith("https://")):
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/videos"
            payload = {"file_url": media_url, "description": caption, "access_token": access_token}
        elif media_url and (media_url.startswith("http://") or media_url.startswith("https://")) and not media_url.lower().split('?')[0].endswith(".webp"):
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/photos"
            payload = {"url": media_url, "caption": caption, "access_token": access_token}
        else:
            # Feed text post fallback (handles text-only or webp images cleanly)
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/feed"
            payload = {"message": caption, "access_token": access_token}
            if media_url and (media_url.startswith("http://") or media_url.startswith("https://")):
                payload["link"] = media_url

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
    caption = post_data.get("caption") or ""
    media_url = (post_data.get("media_urls") or "").split(",")[0].strip()

    creds = get_meta_credentials()
    results = []
    successes = 0

    if "instagram" in platforms:
        if not creds["instagram_account_id"]:
            results.append("Instagram: Omitido (ID no configurado)")
        else:
            if post_type == "reel":
                ok, msg = publish_to_instagram_reel(media_url, caption)
            else:
                ok, msg = publish_to_instagram_photo(media_url, caption)
            results.append(f"Instagram: {'OK' if ok else msg}")
            if ok: successes += 1

    if "facebook" in platforms:
        if not creds["facebook_page_id"]:
            results.append("Facebook: Omitido (ID no configurado)")
        else:
            is_vid = (post_type == "reel")
            ok, msg = publish_to_facebook_page(media_url, caption, is_video=is_vid)
            results.append(f"Facebook: {'OK' if ok else msg}")
            if ok: successes += 1

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

