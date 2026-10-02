import unicodedata
import re
from typing import Tuple, List, Optional

def get_brand_hashtag(store_name: str) -> str:
    """Genera un hashtag comercial limpio a partir del nombre del negocio.
    
    Ejemplo: 'Hidroponía Rosario' -> '#HidroponiaRosario'
    """
    if not store_name:
        return "#Tienda"
    # Normalizar eliminando tildes y caracteres diacríticos
    normalized = unicodedata.normalize('NFKD', store_name).encode('ASCII', 'ignore').decode('utf-8')
    words = re.findall(r'[A-Za-z0-9]+', normalized)
    if not words:
        return "#Tienda"
    parts = []
    for w in words:
        if w.isupper() and len(w) > 3:
            parts.append(w.capitalize())
        elif any(c.islower() for c in w) and any(c.isupper() for c in w):
            parts.append(w)
        else:
            parts.append(w.capitalize())
            
    clean_tag = "".join(parts)
    return f"#{clean_tag}"


def sanitize_marketing_text(text: str, store_name: str, fiscal_name: str = "") -> str:
    """Elimina menciones de nombres de personas físicas o razones sociales del texto publicitario."""
    if not text:
        return ""
    
    forbidden_terms = [
        "Franco Agustin Gentili", 
        "Gentili Franco Agustin", 
        "Franco Gentili", 
        "Gentili Franco",
        "Franco Agustin",
        "Gentili"
    ]
    if fiscal_name and fiscal_name.strip():
        forbidden_terms.insert(0, fiscal_name.strip())

    cleaned = text
    # Caso específico común de IA cuando confunde stock con titular de cuenta
    cleaned = re.sub(
        r'Stock disponible:\s*(?:GENTILI FRANCO AGUSTIN|FRANCO AGUSTIN GENTILI|FRANCO GENTILI)',
        'Stock disponible para entrega inmediata',
        cleaned,
        flags=re.IGNORECASE
    )

    for term in forbidden_terms:
        if not term or len(term) < 4:
            continue
        # No reemplazar si es parte de palabras comerciales comunes
        if term.lower() in ('hidroponia', 'rosario', 'cultivo', 'tienda'):
            continue
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        cleaned = pattern.sub(store_name, cleaned)

    return cleaned


def clean_and_enforce_hashtags(raw_hashtags: str, store_name: str, fiscal_name: str = "") -> str:
    """Procesa los hashtags asegurando que cada uno empiece con '#', 
    que el primer hashtag sea siempre el del negocio (#NombreDelNegocio),
    y eliminando cualquier nombre de persona.
    """
    brand_tag = get_brand_hashtag(store_name)
    forbidden_terms = [
        "Franco Agustin Gentili", 
        "Gentili Franco Agustin", 
        "Franco Gentili", 
        "Gentili Franco",
        "Franco",
        "Gentili",
        "Agustin"
    ]
    if fiscal_name and fiscal_name.strip():
        forbidden_terms.insert(0, fiscal_name.strip())

    # Palabras clave individuales a bloquear en hashtags si tienen longitud >= 4
    forbidden_tokens = set()
    for term in forbidden_terms:
        norm = unicodedata.normalize('NFKD', term).encode('ASCII', 'ignore').decode('utf-8').lower()
        for w in re.split(r'[^a-z0-9]+', norm):
            if len(w) >= 4 and w not in ('hidroponia', 'rosario', 'cultivo', 'tienda', 'online', 'insumos', 'riego'):
                forbidden_tokens.add(w)

    tokens = re.findall(r'#?[A-Za-z0-9_áéíóúÁÉÍÓÚñÑ]+', raw_hashtags or "")
    clean_tags = []
    seen = set()

    for token in tokens:
        clean_word = token.lstrip('#').strip()
        if not clean_word:
            continue
        tag_ascii = unicodedata.normalize('NFKD', clean_word).encode('ASCII', 'ignore').decode('utf-8')
        if not tag_ascii:
            continue
            
        norm_lower = tag_ascii.lower()
        # Filtrar si contiene nombres de personas prohibidos
        if any(tok in norm_lower for tok in forbidden_tokens):
            continue
            
        formatted_tag = f"#{tag_ascii}"
        if norm_lower not in seen:
            seen.add(norm_lower)
            clean_tags.append(formatted_tag)

    # El hashtag del negocio siempre va al inicio (#HidroponiaRosario)
    brand_key = brand_tag.lstrip('#').lower()
    clean_tags = [t for t in clean_tags if t.lstrip('#').lower() != brand_key]
    clean_tags.insert(0, brand_tag)
    seen.add(brand_key)

    # Agregar palabras clave de la marca si no están presentes (ej: #Hidroponia, #Rosario)
    store_words = [w for w in re.findall(r'[A-Za-z0-9]+', unicodedata.normalize('NFKD', store_name).encode('ASCII', 'ignore').decode('utf-8')) if len(w) >= 4]
    for sw in store_words:
        sw_tag = f"#{sw.capitalize()}"
        if sw.lower() not in seen:
            clean_tags.append(sw_tag)
            seen.add(sw.lower())

    return " ".join(clean_tags)


def clean_and_enforce_marketing_post(caption: str, raw_hashtags: str, store_name: str, fiscal_name: str = "") -> Tuple[str, str, str]:
    """Limpia el texto publicitario y asegura hashtags con '#' y la marca del negocio.
    
    Retorna: (clean_caption, clean_hashtags, full_caption)
    """
    clean_caption = sanitize_marketing_text(caption, store_name, fiscal_name)
    clean_hashtags = clean_and_enforce_hashtags(raw_hashtags, store_name, fiscal_name)
    full_caption = f"{clean_caption}\n\n{clean_hashtags}".strip()
    return clean_caption, clean_hashtags, full_caption
