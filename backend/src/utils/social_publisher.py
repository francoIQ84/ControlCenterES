import json
import urllib.request
import urllib.parse
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

def publish_to_instagram_photo(image_url: str, caption: str):
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    ig_id = creds["instagram_account_id"]

    if not access_token or not ig_id:
        return False, "Credenciales de Meta/Instagram no configuradas en Ajustes de Marketing."

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
            return False, "Error al publicar el contenedor en Instagram."

    except Exception as e:
        return False, f"Error en Meta API: {str(e)}"

def publish_to_instagram_reel(video_url: str, caption: str):
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    ig_id = creds["instagram_account_id"]

    if not access_token or not ig_id:
        return False, "Credenciales de Meta/Instagram no configuradas."

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

    except Exception as e:
        return False, f"Error en Meta API (Reel): {str(e)}"

def publish_to_facebook_page(media_url: str, caption: str, is_video: bool = False):
    creds = get_meta_credentials()
    access_token = creds["access_token"]
    page_id = creds["facebook_page_id"]

    if not access_token or not page_id:
        return False, "Credenciales de Facebook Page no configuradas."

    try:
        if is_video:
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/videos"
            payload = {"file_url": media_url, "description": caption, "access_token": access_token}
        else:
            post_url = f"{META_GRAPH_BASE_URL}/{page_id}/photos"
            payload = {"url": media_url, "caption": caption, "access_token": access_token}

        params = urllib.parse.urlencode(payload).encode('utf-8')
        req = urllib.request.Request(post_url, data=params, method="POST")
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            post_id = res_data.get("id") or res_data.get("post_id")

        if post_id:
            return True, f"Facebook Post ID: {post_id}"
        else:
            return False, "Error al publicar en la página de Facebook."
    except Exception as e:
        return False, f"Error en Facebook API: {str(e)}"

def publish_post_to_all_platforms(post_data: dict):
    platforms = [p.strip().lower() for p in (post_data.get("platforms") or "instagram,facebook").split(",")]
    post_type = (post_data.get("post_type") or "post").lower()
    caption = post_data.get("caption") or ""
    media_url = (post_data.get("media_urls") or "").split(",")[0].strip()

    results = []
    successes = 0

    if "instagram" in platforms:
        if post_type == "reel":
            ok, msg = publish_to_instagram_reel(media_url, caption)
        else:
            ok, msg = publish_to_instagram_photo(media_url, caption)
        results.append(f"Instagram: {'OK' if ok else msg}")
        if ok: successes += 1

    if "facebook" in platforms:
        is_vid = (post_type == "reel")
        ok, msg = publish_to_facebook_page(media_url, caption, is_video=is_vid)
        results.append(f"Facebook: {'OK' if ok else msg}")
        if ok: successes += 1

    overall_ok = (successes > 0)
    summary_msg = " | ".join(results)
    return overall_ok, summary_msg
