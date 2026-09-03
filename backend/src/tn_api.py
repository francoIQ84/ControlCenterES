"""
Módulo de integración con Tiendanube (Nuvemshop) para ControlCenterES.

Proporciona:
- Autenticación OAuth 2.0 y conexión en 1 clic.
- Registro y procesamiento de Webhooks en tiempo real.
- Exportación masiva de Catálogo (para poblar tiendas vacías desde cero).
- Exportación de Identidad de Marca (Logo, teléfono, redes, datos de contacto).
- Sincronización bidireccional en tiempo real de Stock y Precios.
- Sincronización y procesamiento de Pedidos y Clientes.
- Modo Demo para desarrollo y pruebas locales.
"""

import os
import time
import json
import hmac
import hashlib
import requests
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

from src import database, integrations, config, tenancy
from src.utils.image_utils import get_high_res_image_url

API_BASE_URL = "https://api.tiendanube.com/v1"
AUTH_BASE_URL = "https://www.tiendanube.com/apps/authorize/token"
PARTNER_TOKENS_URL = "https://www.tiendanube.com/api/v1/partners/tokens"

DEFAULT_USER_AGENT = "ControlCenterES (soporte@controlcenter.com.ar)"


# ---------------------------------------------------------------------------
# Configuración y Credenciales
# ---------------------------------------------------------------------------

def get_client_id() -> str:
    return (
        os.environ.get("TIENDANUBE_CLIENT_ID")
        or database.get_setting("tn_client_id", "")
        or ""
    ).strip()


def get_client_secret() -> str:
    return (
        os.environ.get("TIENDANUBE_CLIENT_SECRET")
        or database.get_setting("tn_client_secret", "")
        or ""
    ).strip()


def get_redirect_uri() -> str:
    return (
        os.environ.get("TIENDANUBE_REDIRECT_URI")
        or database.get_setting("tn_redirect_uri", "")
        or ""
    ).strip()


def is_demo_mode() -> bool:
    demo_setting = database.get_setting("demo_mode", "0")
    return demo_setting == "1" and not bool(get_access_token())


def get_credentials() -> Optional[dict]:
    return integrations.get_credentials("tiendanube")


def get_access_token() -> Optional[str]:
    creds = get_credentials()
    if creds:
        return creds.get("access_token")
    return database.get_setting("tn_access_token", None)


def get_store_id() -> Optional[str]:
    creds = get_credentials()
    if creds:
        return str(creds.get("store_id") or creds.get("user_id") or creds.get("external_account_id") or "")
    return database.get_setting("tn_store_id", None)


def is_connected() -> bool:
    token = get_access_token()
    store_id = get_store_id()
    if not token or not store_id:
        return False
    if str(token).startswith("tn_mock_token_"):
        return False
    return True


# ---------------------------------------------------------------------------
# Headers y Peticiones a la API
# ---------------------------------------------------------------------------

def _get_headers(access_token: Optional[str] = None) -> dict:
    token = access_token or get_access_token()
    return {
        "Authentication": f"bearer {token}",
        "User-Agent": DEFAULT_USER_AGENT,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }


def api_request(method: str, path: str, json_data: Any = None, params: Optional[dict] = None, access_token: Optional[str] = None, store_id: Optional[str] = None) -> Tuple[bool, Any]:
    """Ejecuta una petición autenticada a la API de Tiendanube."""
    if is_demo_mode():
        return True, {"demo": True, "message": "Operación simulada en modo demo"}

    sid = store_id or get_store_id()
    if not sid:
        return False, "Falta el Store ID de Tiendanube"

    token = access_token or get_access_token()
    if not token:
        return False, "Falta el Access Token de Tiendanube"

    clean_path = path.lstrip("/")
    url = f"{API_BASE_URL}/{sid}/{clean_path}"
    headers = _get_headers(token)

    try:
        req_method = method.upper()
        if req_method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=20)
        elif req_method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, params=params, timeout=25)
        elif req_method == "PUT":
            resp = requests.put(url, headers=headers, json=json_data, params=params, timeout=25)
        elif req_method == "DELETE":
            resp = requests.delete(url, headers=headers, params=params, timeout=20)
        else:
            return False, f"Método HTTP {method} no soportado"

        if resp.status_code in (200, 201):
            try:
                return True, resp.json()
            except Exception:
                return True, resp.text
        elif resp.status_code == 204:
            return True, None
        else:
            try:
                err_body = resp.json()
            except Exception:
                err_body = resp.text
            print(f"[Tiendanube API Error] {method} {url} -> {resp.status_code}: {err_body}")
            return False, f"Error {resp.status_code}: {err_body}"

    except Exception as exc:
        print(f"[Tiendanube API Exception] {method} {url}: {exc}")
        return False, f"Excepción de conexión con Tiendanube: {str(exc)}"


# ---------------------------------------------------------------------------
# Autenticación OAuth 2.0
# ---------------------------------------------------------------------------

def get_auth_url(state: Optional[str] = None) -> str:
    """Genera la URL de autorización oficial de Tiendanube."""
    client_id = get_client_id()
    tenant_state = state or tenancy.get_current_tenant_id()
    return f"https://www.tiendanube.com/apps/{client_id}/authorize?state={tenant_state}"


def authenticate_with_code(code: str, custom_redirect_uri: Optional[str] = None) -> Tuple[bool, str]:
    """Intercambia el código de autorización por un Access Token permanente."""
    if is_demo_mode():
        integrations.save_credentials("tiendanube", {
            "access_token": "tn_mock_token_123456789",
            "store_id": "999888",
            "user_id": "999888",
            "scope": "read_products,write_products,read_orders,write_orders"
        }, external_account_id="999888", is_active=True)
        return True, "Autenticado en modo DEMO con Tiendanube"

    client_id = get_client_id()
    client_secret = get_client_secret()

    if not client_id or not client_secret:
        return False, "Faltan configurar TIENDANUBE_CLIENT_ID y TIENDANUBE_CLIENT_SECRET en el servidor"

    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": code
    }

    # Intentar primero por PARTNER_TOKENS_URL y luego por AUTH_BASE_URL si fuera necesario
    for token_url in (PARTNER_TOKENS_URL, AUTH_BASE_URL):
        try:
            resp = requests.post(token_url, json=payload, headers={"User-Agent": DEFAULT_USER_AGENT}, timeout=20)
            if resp.status_code in (200, 201):
                data = resp.json()
                access_token = data.get("access_token")
                store_id = str(data.get("user_id") or data.get("store_id") or "")
                scope = data.get("scope", "")

                if not access_token or not store_id:
                    return False, "La respuesta de Tiendanube no incluyó access_token o user_id"

                # Guardar credenciales cifradas por tenant
                integrations.save_credentials("tiendanube", {
                    "client_id": client_id,
                    "access_token": access_token,
                    "store_id": store_id,
                    "user_id": store_id,
                    "scope": scope,
                    "token_type": data.get("token_type", "bearer")
                }, external_account_id=store_id, is_active=True)

                # Registrar webhooks automáticamente en segundo plano
                register_all_webhooks(store_id, access_token)

                return True, f"Tiendanube conectada exitosamente (Tienda #{store_id})"
        except Exception as exc:
            print(f"[Tiendanube OAuth Exception] {token_url}: {exc}")

    return False, "No se pudo obtener el token de acceso desde Tiendanube"


# ---------------------------------------------------------------------------
# Gestión de Webhooks
# ---------------------------------------------------------------------------

WEBHOOK_EVENTS = [
    "order/created",
    "order/paid",
    "order/updated",
    "order/cancelled",
    "order/fulfilled",
    "product/created",
    "product/updated",
    "product/deleted",
    "app/uninstalled"
]


def register_all_webhooks(store_id: str, access_token: str) -> dict:
    """Registra automáticamente todos los webhooks necesarios en Tiendanube."""
    if is_demo_mode():
        return {"registered": len(WEBHOOK_EVENTS), "errors": []}

    base_url = (
        os.environ.get("PUBLIC_BACKEND_URL")
        or os.environ.get("BACKEND_URL")
        or database.get_setting("backend_public_url", "")
    ).rstrip("/")

    if not base_url:
        # Si no hay URL pública explícita, usar el redirect uri base
        red = get_redirect_uri()
        if red:
            base_url = "/".join(red.split("/")[:3])
        else:
            base_url = "https://api.controlcenter.com.ar"

    webhook_target_url = f"{base_url}/api/tiendanube/webhook"

    # Consultar webhooks existentes para no duplicar
    ok, existing_list = api_request("GET", "webhooks", access_token=access_token, store_id=store_id)
    existing_events = set()
    if ok and isinstance(existing_list, list):
        for wh in existing_list:
            if wh.get("url") == webhook_target_url:
                existing_events.add(wh.get("event"))

    registered = 0
    errors = []

    for event in WEBHOOK_EVENTS:
        if event in existing_events:
            continue
        payload = {
            "event": event,
            "url": webhook_target_url
        }
        ok_post, res = api_request("POST", "webhooks", json_data=payload, access_token=access_token, store_id=store_id)
        if ok_post:
            registered += 1
        else:
            errors.append(f"{event}: {res}")

    print(f"[Tiendanube Webhooks] Registrados: {registered}, Omitidos existentes: {len(existing_events)}, Errores: {len(errors)}")
    return {"registered": registered, "existing": len(existing_events), "errors": errors}


def verify_webhook_hmac(raw_body: bytes, hmac_header: str) -> bool:
    """Verifica que el webhook entrante provenga genuinamente de Tiendanube."""
    secret = get_client_secret()
    if not secret:
        return True  # Si no hay secret configurado en local, permitir en desarrollo
    try:
        calculated_hmac = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(calculated_hmac, hmac_header.strip())
    except Exception as exc:
        print(f"[Tiendanube HMAC Error] {exc}")
        return False


# ---------------------------------------------------------------------------
# Sincronización de Identidad de Marca y Logo
# ---------------------------------------------------------------------------

def export_store_branding_to_tn() -> Tuple[bool, str]:
    """Sube el logo corporativo y sincroniza los datos comerciales de la tienda."""
    if is_demo_mode():
        return True, "Identidad y logo sincronizados en modo DEMO"

    store_name = (
        database.get_setting("store_name")
        or database.get_setting("company_name")
        or "Tienda Oficial"
    )
    contact_phone = (
        database.get_setting("contact_phone")
        or database.get_setting("whatsapp_phone")
        or ""
    )
    contact_email = database.get_setting("contact_email", "")
    address = database.get_setting("address", "")
    hero_subtitle = database.get_setting("hero_subtitle", "")

    store_payload = {
        "name": {"es": store_name},
        "description": {"es": hero_subtitle or f"Tienda oficial de {store_name}"}
    }
    if contact_phone:
        store_payload["phone"] = contact_phone
    if contact_email:
        store_payload["email"] = contact_email
    if address:
        store_payload["address"] = address

    ok_store, store_res = api_request("PUT", "store", json_data=store_payload)

    # Subir Logotipo si está disponible
    logo_url = (
        database.get_setting("logo_url")
        or database.get_setting("web_logo_url")
        or ""
    )

    logo_uploaded = False
    if logo_url:
        try:
            # Si el logo es una URL válida, enviarlo como imagen de logo
            logo_payload = {"src": logo_url}
            ok_logo, _ = api_request("POST", "store/logo", json_data=logo_payload)
            logo_uploaded = ok_logo
        except Exception as l_err:
            print(f"[Tiendanube Logo Sync Error] {l_err}")

    msg = f"Datos de tienda actualizados ({store_name})."
    if logo_uploaded:
        msg += " Logotipo oficial sincronizado correctamente."

    return ok_store, msg


# ---------------------------------------------------------------------------
# Exportación de Categorías y Catálogo Masivo
# ---------------------------------------------------------------------------

def export_categories_to_tn() -> Dict[int, str]:
    """Crea o mapea todas las categorías de ControlCenter en Tiendanube."""
    if is_demo_mode():
        return {1: "101", 2: "102"}

    categories = database.get_all_categories()
    category_map = {}  # local_cat_id -> tn_cat_id

    # Obtener categorías existentes en Tiendanube
    ok_get, tn_cats = api_request("GET", "categories")
    existing_tn_by_name = {}
    if ok_get and isinstance(tn_cats, list):
        for tc in tn_cats:
            name_es = (tc.get("name", {}).get("es") if isinstance(tc.get("name"), dict) else str(tc.get("name") or "")).strip().lower()
            existing_tn_by_name[name_es] = str(tc.get("id"))

    for cat in categories:
        cat_id = cat["id"]
        cat_name = cat["name"].strip()
        cat_name_key = cat_name.lower()
        existing_tn_id = cat.get("tn_id")

        if existing_tn_id:
            category_map[cat_id] = str(existing_tn_id)
            continue

        if cat_name_key in existing_tn_by_name:
            found_id = existing_tn_by_name[cat_name_key]
            database.update_category_tn_id(cat_id, found_id)
            category_map[cat_id] = found_id
            continue

        # Crear categoría en Tiendanube
        payload = {
            "name": {"es": cat_name},
            "description": {"es": f"Productos de {cat_name}"}
        }
        ok_create, res_create = api_request("POST", "categories", json_data=payload)
        if ok_create and isinstance(res_create, dict) and "id" in res_create:
            new_tn_id = str(res_create["id"])
            database.update_category_tn_id(cat_id, new_tn_id)
            category_map[cat_id] = new_tn_id
            existing_tn_by_name[cat_name_key] = new_tn_id

    return category_map


def export_catalog_to_tn(
    price_source: str = "auto",
    only_with_stock: bool = False,
    price_modifier_pct: float = 0.0,
    progress_callback=None
) -> dict:
    """Exporta y crea masivamente los productos existentes de ControlCenter a Tiendanube."""
    if is_demo_mode():
        if progress_callback:
            progress_callback(current=10, total=10, message="Exportación en modo DEMO completada.")
        return {"total": 10, "created": 10, "updated": 0, "errors": []}

    # 1. Asegurar branding y categorías
    export_store_branding_to_tn()
    cat_map = export_categories_to_tn()

    # 2. Obtener productos locales
    products = database.get_all_products(include_hidden=False)
    if only_with_stock:
        products = [p for p in products if (p.get("available_quantity") or 0) > 0]

    total_products = len(products)
    created_count = 0
    updated_count = 0
    errors = []

    for idx, p in enumerate(products, start=1):
        ml_id = p["ml_id"]
        title = p["title"]

        if progress_callback:
            progress_callback(
                current=idx,
                total=total_products,
                message=f"Exportando {idx}/{total_products}: {title[:40]}..."
            )

        # Determinar precio final
        raw_price = float(p.get("price_web") or 0.0)
        if price_source == "list" or raw_price <= 0:
            raw_price = float(p.get("price") or 0.0)

        if price_modifier_pct != 0.0:
            raw_price = raw_price * (1.0 + price_modifier_pct / 100.0)

        final_price = round(max(1.0, raw_price), 2)
        stock_qty = max(0, int(p.get("available_quantity") or 0))

        # Determinar categorías
        cat_id = p.get("category_id")
        tn_cat_ids = []
        if cat_id and cat_id in cat_map:
            tn_cat_ids.append(int(cat_map[cat_id]))

        # Preparar imágenes
        images_str = p.get("images") or p.get("thumbnail") or ""
        images_list = []
        if images_str:
            for raw_img in images_str.replace("\n", ",").split(","):
                img_clean = raw_img.strip()
                if img_clean and img_clean.startswith("http"):
                    # Maximizar resolución si proviene de Mercado Libre
                    images_list.append({"src": get_high_res_image_url(img_clean)})

        # Descripción del producto
        desc = p.get("description") or p.get("description_meli") or ""
        if desc:
            desc_html = f"<p>{desc.replace(chr(10), '<br>')}</p>"
        else:
            desc_html = f"<p>{title}</p>"

        # Armar payload para Tiendanube
        product_payload = {
            "name": {"es": title},
            "description": {"es": desc_html},
            "categories": tn_cat_ids,
            "variants": [
                {
                    "price": f"{final_price:.2f}",
                    "promotional_price": None,
                    "stock": stock_qty,
                    "sku": ml_id,
                    "barcode": p.get("barcode") or "",
                    "weight": "0.5"
                }
            ]
        }
        if images_list:
            product_payload["images"] = images_list

        existing_tn_id = p.get("tn_id")

        if existing_tn_id:
            # Actualizar producto existente
            ok_up, res_up = api_request("PUT", f"products/{existing_tn_id}", json_data=product_payload)
            if ok_up:
                updated_count += 1
                var_id = None
                if isinstance(res_up, dict) and res_up.get("variants"):
                    var_id = str(res_up["variants"][0]["id"])
                database.update_product_tn_mapping(ml_id, existing_tn_id, var_id)
            else:
                errors.append(f"{ml_id}: {res_up}")
        else:
            # Crear producto nuevo en Tiendanube
            ok_cr, res_cr = api_request("POST", "products", json_data=product_payload)
            if ok_cr and isinstance(res_cr, dict) and "id" in res_cr:
                new_tn_id = str(res_cr["id"])
                new_var_id = str(res_cr["variants"][0]["id"]) if res_cr.get("variants") else None
                database.update_product_tn_mapping(ml_id, new_tn_id, new_var_id)
                created_count += 1
            else:
                errors.append(f"{ml_id}: {res_cr}")

        # Pausa sutil para respetar el rate limit de Tiendanube (máx 2 req/s)
        time.sleep(0.4)

    return {
        "total": total_products,
        "created": created_count,
        "updated": updated_count,
        "errors": errors
    }


# ---------------------------------------------------------------------------
# Sincronización en Tiempo Real de Stock y Precios
# ---------------------------------------------------------------------------

def update_tn_stock(tn_product_id: str, tn_variant_id: str, new_stock: int) -> Tuple[bool, str]:
    """Actualiza el stock de una variante en Tiendanube al instante."""
    if is_demo_mode():
        return True, "Stock actualizado en modo DEMO"

    if not tn_product_id or not tn_variant_id:
        return False, "Faltan identificadores de Tiendanube (tn_product_id o tn_variant_id)"

    payload = {"stock": max(0, int(new_stock))}
    ok, res = api_request("PUT", f"products/{tn_product_id}/variants/{tn_variant_id}", json_data=payload)
    if ok:
        return True, f"Stock de variante #{tn_variant_id} actualizado a {new_stock}"
    return False, str(res)


def update_tn_price(tn_product_id: str, tn_variant_id: str, new_price: float) -> Tuple[bool, str]:
    """Actualiza el precio de una variante en Tiendanube al instante."""
    if is_demo_mode():
        return True, "Precio actualizado en modo DEMO"

    if not tn_product_id or not tn_variant_id:
        return False, "Faltan identificadores de Tiendanube"

    payload = {"price": f"{float(new_price):.2f}"}
    ok, res = api_request("PUT", f"products/{tn_product_id}/variants/{tn_variant_id}", json_data=payload)
    if ok:
        return True, f"Precio de variante #{tn_variant_id} actualizado a ${new_price:.2f}"
    return False, str(res)


# ---------------------------------------------------------------------------
# Procesamiento de Pedidos y Webhooks de Ventas
# ---------------------------------------------------------------------------

def parse_and_save_tn_order(order_data: dict) -> Tuple[bool, str]:
    """Convierte un payload de pedido de Tiendanube al esquema unificado de ControlCenterES."""
    if not isinstance(order_data, dict):
        return False, "Payload de orden inválido"

    tn_order_id = str(order_data.get("id") or order_data.get("number") or "")
    if not tn_order_id:
        return False, "Falta el ID del pedido de Tiendanube"

    # Datos del Comprador
    customer = order_data.get("customer") or {}
    buyer_id = customer.get("id") or int(hashlib.md5(f"TN-{tn_order_id}".encode()).hexdigest()[:12], 16)
    buyer_name = customer.get("name") or customer.get("billing_name") or "Cliente Tiendanube"
    buyer_email = customer.get("email") or ""
    buyer_phone = customer.get("phone") or customer.get("billing_phone") or ""
    document_num = customer.get("identification") or customer.get("billing_identification") or ""

    # Dirección de Entrega
    shipping_addr = order_data.get("shipping_address") or {}
    address_parts = [
        shipping_addr.get("address", ""),
        shipping_addr.get("number", ""),
        shipping_addr.get("locality", ""),
        shipping_addr.get("city", ""),
        shipping_addr.get("province", "")
    ]
    full_address = ", ".join([p for p in address_parts if p])

    # Mapeo de Estados
    raw_status = order_data.get("status", "open")
    raw_payment = order_data.get("payment_status", "pending")
    raw_shipping = order_data.get("shipping_status", "unshipped")

    status_map = {
        "open": "confirmed",
        "closed": "paid",
        "cancelled": "cancelled"
    }
    payment_map = {
        "paid": "approved",
        "pending": "pending",
        "voided": "cancelled",
        "refunded": "refunded"
    }
    shipping_map = {
        "unpacked": "pending",
        "unshipped": "ready_to_ship",
        "shipped": "shipped",
        "delivered": "delivered"
    }

    status = status_map.get(raw_status, "confirmed")
    payment_status = payment_map.get(raw_payment, "pending")
    shipping_status = shipping_map.get(raw_shipping, "pending")

    # Ítems del Pedido
    products_raw = order_data.get("products") or []
    items = []
    items_to_deduct = []

    for item in products_raw:
        item_name = item.get("name") or "Producto Tiendanube"
        item_qty = int(item.get("quantity") or 1)
        item_price = float(item.get("price") or 0.0)
        item_sku = item.get("sku") or ""
        item_var_id = str(item.get("variant_id") or "")
        item_prod_id = str(item.get("product_id") or "")

        # Buscar el producto local en products_cache
        local_prod = None
        if item_sku:
            local_prod = database.get_product_by_id(item_sku)
        if not local_prod and item_var_id:
            local_prod = database.get_product_by_tn_variant_id(item_var_id)
        if not local_prod and item_prod_id:
            local_prod = database.get_product_by_tn_id(item_prod_id)

        item_ml_id = local_prod["ml_id"] if local_prod else (item_sku or f"TN-{item_prod_id}")

        items.append({
            "item_id": item_ml_id,
            "title": item_name,
            "quantity": item_qty,
            "unit_price": item_price,
            "sku": item_sku,
            "tn_variant_id": item_var_id
        })

        if local_prod:
            items_to_deduct.append((local_prod["ml_id"], item_qty))

    total_amount = float(order_data.get("total") or 0.0)
    created_at = order_data.get("created_at") or datetime.now().isoformat()

    order_payload = {
        "order_id": tn_order_id,
        "date_created": created_at,
        "buyer": {
            "id": buyer_id,
            "nickname": f"TN_{customer.get('id', tn_order_id)}",
            "name": buyer_name,
            "email": buyer_email,
            "phone": buyer_phone,
            "document_type": "DNI" if len(document_num) <= 9 else "CUIT",
            "document_number": document_num,
            "address": full_address
        },
        "total_amount": total_amount,
        "currency_id": order_data.get("currency", "ARS"),
        "status": status,
        "payment_status": payment_status,
        "payment_method": order_data.get("gateway_name") or order_data.get("payment_method") or "Tiendanube",
        "shipping_status": shipping_status,
        "items": items,
        "source_platform": "TIENDANUBE",
        "meli_invoice_attached": 0
    }

    # Persistir en la base de datos
    database.save_orders_and_customers([order_payload])

    # Si es una orden nueva pagada o confirmada, descontar inventario central
    if raw_payment in ("paid", "pending") and raw_status != "cancelled":
        for ml_id, qty in items_to_deduct:
            ok_deduct, remaining_stock = database.deduct_product_stock_by_ml_id(ml_id, qty)
            if ok_deduct:
                # Sincronizar hacia Mercado Libre si el producto está vinculado
                try:
                    from src import meli_api
                    if not meli_api.is_demo_mode():
                        meli_api.update_product_stock(ml_id, remaining_stock)
                except Exception as m_err:
                    print(f"[Stock Sync MeLi Error tras venta en TN] {m_err}")

    return True, f"Orden de Tiendanube #{tn_order_id} guardada exitosamente"


def sync_orders(limit: int = 50, date_from: Optional[str] = None) -> Tuple[bool, int]:
    """Descarga y sincroniza las últimas órdenes desde la API de Tiendanube."""
    if is_demo_mode():
        return True, 0

    params = {"status": "any", "per_page": min(200, limit)}
    if date_from:
        params["created_at_min"] = date_from

    ok, orders_res = api_request("GET", "orders", params=params)
    if not ok or not isinstance(orders_res, list):
        return False, 0

    count = 0
    for order_obj in orders_res:
        ok_save, _ = parse_and_save_tn_order(order_obj)
        if ok_save:
            count += 1

    integrations.touch_last_sync("tiendanube")
    return True, count


# ---------------------------------------------------------------------------
# Importación desde Tiendanube a ControlCenterES (Poblado Inverso)
# ---------------------------------------------------------------------------

def import_store_branding_from_tn() -> Tuple[bool, str]:
    """Importa el logotipo y datos de contacto oficiales desde Tiendanube hacia ControlCenterES."""
    if is_demo_mode():
        return True, "Branding importado en modo DEMO"

    ok, store_info = api_request("GET", "store")
    if not ok or not isinstance(store_info, dict):
        return False, f"No se pudo consultar los datos de la tienda: {store_info}"

    # Extraer nombre
    name_obj = store_info.get("name")
    store_name = (name_obj.get("es") if isinstance(name_obj, dict) else str(name_obj or "")).strip()
    if store_name:
        database.set_setting("store_name", store_name)
        database.set_setting("hero_title", store_name)

    # Extraer descripción
    desc_obj = store_info.get("description")
    desc_text = (desc_obj.get("es") if isinstance(desc_obj, dict) else str(desc_obj or "")).strip()
    if desc_text:
        database.set_setting("hero_subtitle", desc_text)

    # Contacto
    phone = store_info.get("phone") or ""
    if phone:
        database.set_setting("contact_phone", phone)
        database.set_setting("whatsapp_phone", phone)

    email = store_info.get("email") or ""
    if email:
        database.set_setting("contact_email", email)

    address = store_info.get("address") or ""
    if address:
        database.set_setting("address", address)

    # Logo
    logo_data = store_info.get("logo")
    logo_url = (logo_data.get("src") if isinstance(logo_data, dict) else str(logo_data or "")).strip()
    if logo_url:
        database.set_setting("logo_url", logo_url)
        database.set_setting("web_logo_url", logo_url)

    return True, f"Datos de marca y logotipo importados desde Tiendanube ({store_name or 'Tienda'})."


def import_categories_from_tn() -> Dict[str, int]:
    """Importa todas las categorías existentes de Tiendanube y las crea en ControlCenterES."""
    if is_demo_mode():
        return {"101": 1, "102": 2}

    ok, tn_cats = api_request("GET", "categories")
    if not ok or not isinstance(tn_cats, list):
        return {}

    cat_map = {}  # tn_cat_id -> local_cat_id
    for tc in tn_cats:
        tn_id = str(tc.get("id"))
        name_obj = tc.get("name")
        cat_name = (name_obj.get("es") if isinstance(name_obj, dict) else str(name_obj or "")).strip()
        slug_obj = tc.get("handle")
        cat_slug = (slug_obj.get("es") if isinstance(slug_obj, dict) else str(slug_obj or "")).strip()

        if cat_name:
            local_id = database.upsert_category_from_tn(cat_name, tn_id, slug=cat_slug)
            cat_map[tn_id] = local_id

    return cat_map


def import_catalog_from_tn(
    sync_images: bool = True,
    progress_callback=None
) -> dict:
    """Descarga e importa todos los productos y variantes desde Tiendanube hacia ControlCenterES."""
    if is_demo_mode():
        if progress_callback:
            progress_callback(current=5, total=5, message="Importación en modo DEMO completada.")
        return {"total": 5, "imported": 5, "categories": 2, "errors": []}

    # 1. Importar categorías primero
    cat_map = import_categories_from_tn()

    page = 1
    per_page = 50
    imported_count = 0
    all_tn_products = []
    errors = []

    # 2. Descargar todos los productos paginados desde Tiendanube
    while True:
        if progress_callback:
            progress_callback(
                current=len(all_tn_products),
                total=max(1, len(all_tn_products) + 50),
                message=f"Descargando productos desde Tiendanube (página {page})..."
            )

        ok, prods_page = api_request("GET", "products", params={"page": page, "per_page": per_page})
        if not ok or not isinstance(prods_page, list) or len(prods_page) == 0:
            break

        all_tn_products.extend(prods_page)
        if len(prods_page) < per_page:
            break
        page += 1
        time.sleep(0.3)

    total_prods = len(all_tn_products)

    # 3. Procesar y guardar cada producto en ControlCenterES
    for idx, tp in enumerate(all_tn_products, start=1):
        tn_prod_id = str(tp.get("id"))
        name_obj = tp.get("name")
        title = (name_obj.get("es") if isinstance(name_obj, dict) else str(name_obj or "")).strip()

        if not title:
            continue

        if progress_callback:
            progress_callback(
                current=idx,
                total=total_prods,
                message=f"Guardando {idx}/{total_prods}: {title[:40]}..."
            )

        desc_obj = tp.get("description")
        desc_raw = (desc_obj.get("es") if isinstance(desc_obj, dict) else str(desc_obj or "")).strip()

        # Limpiar tags HTML básicos para la descripción corta
        import re
        desc_clean = re.sub(r'<[^>]+>', '\n', desc_raw).strip()

        # Imágenes
        raw_images = tp.get("images") or []
        image_urls = []
        thumbnail = ""
        for img in raw_images:
            src = img.get("src") or ""
            if src:
                image_urls.append(src)
                if not thumbnail:
                    thumbnail = src

        images_str = ",".join(image_urls)

        # Mapeo de Categoría
        local_cat_id = None
        tp_cats = tp.get("categories") or []
        if tp_cats:
            first_tn_cat_id = str(tp_cats[0].get("id") if isinstance(tp_cats[0], dict) else tp_cats[0])
            local_cat_id = cat_map.get(first_tn_cat_id)

        # Variantes
        variants = tp.get("variants") or []
        if variants:
            main_var = variants[0]
            var_id = str(main_var.get("id"))
            price = float(main_var.get("price") or 0.0)
            stock = int(main_var.get("stock") or 0)
            sku = (main_var.get("sku") or "").strip()
            barcode = (main_var.get("barcode") or "").strip()
        else:
            var_id = ""
            price = 0.0
            stock = 0
            sku = ""
            barcode = ""

        # Identificador local (ml_id)
        if sku and (sku.startswith("MLA") or sku.startswith("LOCAL-")):
            local_ml_id = sku
        else:
            local_ml_id = f"TN-{tn_prod_id}"

        prod_record = {
            "ml_id": local_ml_id,
            "title": title,
            "price": price,
            "price_web": price,
            "available_quantity": stock,
            "cost_price": 0.0,
            "cost_meli": 0.0,
            "permalink": tp.get("canonical_url") or "",
            "thumbnail": thumbnail,
            "images": images_str,
            "description": desc_clean,
            "is_web_active": 1 if tp.get("published", True) else 0,
            "category_id": local_cat_id,
            "sync_meli": 1 if local_ml_id.startswith("MLA") else 0,
            "min_stock": 0,
            "tn_id": tn_prod_id,
            "tn_variant_id": var_id
        }

        try:
            database.upsert_imported_tn_product(prod_record)
            imported_count += 1
        except Exception as p_err:
            print(f"[Import TN Product Error] {tn_prod_id}: {p_err}")
            errors.append(f"#{tn_prod_id} ({title}): {p_err}")

    return {
        "total": total_prods,
        "imported": imported_count,
        "categories": len(cat_map),
        "errors": errors
    }


def import_all_from_tn(progress_callback=None) -> dict:
    """Ejecuta una importación total desde Tiendanube: Identidad de Marca, Catálogo y Pedidos recientes."""
    if progress_callback:
        progress_callback(current=0, total=100, message="Importando identidad de marca y logotipo...")

    ok_b, msg_b = import_store_branding_from_tn()

    if progress_callback:
        progress_callback(current=20, total=100, message="Importando catálogo y categorías...")

    cat_res = import_catalog_from_tn(progress_callback=lambda c, t, m: progress_callback(
        current=int(20 + (c / max(1, t)) * 60),
        total=100,
        message=m
    ) if progress_callback else None)

    if progress_callback:
        progress_callback(current=85, total=100, message="Importando pedidos históricos de Tiendanube...")

    ok_orders, order_count = sync_orders(limit=200)

    if progress_callback:
        progress_callback(current=100, total=100, message="¡Importación total desde Tiendanube completada con éxito!")

    return {
        "branding": ok_b,
        "branding_message": msg_b,
        "products_total": cat_res.get("total", 0),
        "products_imported": cat_res.get("imported", 0),
        "categories_imported": cat_res.get("categories", 0),
        "orders_imported": order_count
    }

