import re

def get_high_res_image_url(url: str) -> str:
    """
    Converts Mercado Libre image URLs to their highest resolution variant (-O.jpg)
    and ensures https:// scheme for Meta API compliance.
    """
    if not url:
        return ""
    url = url.strip()
    
    # Replace ML thumbnail/preview indicators like -I.jpg, -V.jpg, -E.jpg, -C.jpg, -N.jpg with -O.jpg
    # Examples:
    # http://http2.mlstatic.com/D_NQ_NP_12345-MLA12345_122020-I.jpg -> https://http2.mlstatic.com/D_NQ_NP_12345-MLA12345_122020-O.jpg
    # https://http2.mlstatic.com/D_123456-MLA12345678_122020-V.jpg -> https://http2.mlstatic.com/D_123456-MLA12345678_122020-O.jpg
    url = re.sub(r'-[IVECN]\.(jpg|jpeg|png|webp)', r'-O.\1', url, flags=re.IGNORECASE)
    
    # Ensure https protocol for Meta Graph API compliance
    if url.startswith("http://"):
        url = "https://" + url[7:]
        
    return url

def convert_all_images_str(images_str: str) -> str:
    """
    Takes a comma-separated list of image URLs, converts each to high resolution,
    and returns a clean comma-separated string.
    """
    if not images_str:
        return ""
    urls = [get_high_res_image_url(u.strip()) for u in images_str.split(",") if u.strip()]
    return ",".join(urls)
