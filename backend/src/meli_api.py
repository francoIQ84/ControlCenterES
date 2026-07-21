import time
import requests
import json
from datetime import datetime, timedelta
import random
import os

from src import config
from src import database

API_BASE_URL = "https://api.mercadolibre.com"

# --- Demo/Mock Data Generator ---

MOCK_TITLES = [
    "Auriculares Bluetooth Inalámbricos Cancelación de Ruido Pro",
    "Smart TV 55 Pulgadas 4K UHD Slim Design HDR10",
    "Smartphone Android 128GB 8GB RAM Cámara 64MP",
    "Zapatillas Deportivas Running Ultralight Confort",
    "Cafetera Espresso Automática 15 Bares Acero Inoxidable",
    "Teclado Mecánico RGB Gamer Switch Red Español",
    "Mouse Inalámbrico Ergonómico Recargable Silent",
    "Mochila Antirrobo Impermeable Puerto USB Integrado",
    "Termo Acero Inoxidable 1 Litro Conserva Frío/Calor",
    "Silla de Escritorio Ergonómica Regulable Mesh Pro"
]

MOCK_THUMBNAILS = [
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&q=80",  # Headphones
    "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=200&q=80",  # TV
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200&q=80",  # Phone
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&q=80",  # Shoes
    "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=200&q=80",  # Coffee maker
    "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=200&q=80",  # Keyboard
    "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=200&q=80",  # Mouse
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=200&q=80",  # Backpack
    "https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=200&q=80",  # Bottle/Thermos
    "https://images.unsplash.com/photo-1505797149-43b0069ec26b?w=200&q=80"   # Chair
]


MOCK_BUYERS = [
    {"id": 10020304, "nickname": "JUAN_PEREZ88", "name": "Juan Pérez", "email": "juan.perez@example.com", "phone": "11-3456-7890", "document_type": "DNI", "document_number": "34890123"},
    {"id": 10050607, "nickname": "MARIA_GOMEZ_92", "name": "María Gómez", "email": "maria.gomez@example.com", "phone": "11-9876-5432", "document_type": "DNI", "document_number": "36450912"},
    {"id": 10080910, "nickname": "CARLOS_RODRIGUEZ", "name": "Carlos Rodríguez", "email": "carlos.r@example.com", "phone": "341-555-8888", "document_type": "DNI", "document_number": "32112345"},
    {"id": 10111213, "nickname": "ANA_MARTINEZ_SHOP", "name": "Ana Martínez", "email": "ana.martinez@example.com", "phone": "261-444-1111", "document_type": "DNI", "document_number": "29876543"},
    {"id": 10141516, "nickname": "LUCAS_SILVA", "name": "Lucas Silva", "email": "lucas.silva@example.com", "phone": "351-777-9999", "document_type": "DNI", "document_number": "40123456"}
]

def is_demo_mode():
    """Returns True if the app is configured in Demo Mode or lacks API keys."""
    demo_setting = database.get_setting('demo_mode', '1')
    return demo_setting == '1' or not config.is_configured()

def validate_token():
    """Checks if there is a valid (and active) token, or if we can refresh it."""
    if is_demo_mode():
        return True
    access_token = config.get_access_token()
    if not access_token:
        return False
    try:
        return check_and_refresh_token()
    except Exception:
        return False

# --- Authentication and OAuth ---

def get_auth_url():
    """Generates the OAuth authentication URL for Mercado Libre."""
    client_id = config.get_client_id()
    redirect_uri = config.get_redirect_uri()
    country_code = config.get_country()
    
    country_info = config.COUNTRIES.get(country_code, config.COUNTRIES['AR'])
    auth_base = country_info['auth_url']
    
    return f"{auth_base}/authorization?response_type=code&client_id={client_id}&redirect_uri={redirect_uri}"

def authenticate_with_code(code):
    """Exchanges the authorization code for access and refresh tokens."""
    if is_demo_mode():
        # Setup fake auth in demo mode
        config.set_access_token("mock_access_token_12345")
        config.set_refresh_token("mock_refresh_token_67890")
        config.set_token_expiry(time.time() + 21600)  # 6 hours
        config.set_user_id("987654321")
        return True, "Autenticado en modo DEMO"

    client_id = config.get_client_id()
    client_secret = config.get_client_secret()
    redirect_uri = config.get_redirect_uri()

    url = f"{API_BASE_URL}/oauth/token"
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    data = {
        'grant_type': 'authorization_code',
        'client_id': client_id,
        'client_secret': client_secret,
        'code': code,
        'redirect_uri': redirect_uri
    }

    try:
        response = requests.post(url, headers=headers, data=data)
        if response.status_code == 200:
            res_data = response.json()
            access_token = res_data.get('access_token')
            if not access_token:
                return False, "La respuesta de Mercado Libre no contiene el token de acceso ('access_token')."
            
            config.set_access_token(access_token)
            config.set_refresh_token(res_data.get('refresh_token', ''))
            config.set_token_expiry(time.time() + res_data.get('expires_in', 21600))
            config.set_user_id(str(res_data.get('user_id', '')))
            return True, "Autenticación exitosa"
        else:
            return False, f"Error Meli API: {response.text}"
    except Exception as e:
        return False, f"Excepción de conexión: {str(e)}"

def refresh_access_token():
    """Refreshes the access token using the refresh token."""
    if is_demo_mode():
        config.set_token_expiry(time.time() + 21600)
        return True

    client_id = config.get_client_id()
    client_secret = config.get_client_secret()
    refresh_token = config.get_refresh_token()

    if not refresh_token:
        return False

    url = f"{API_BASE_URL}/oauth/token"
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    data = {
        'grant_type': 'refresh_token',
        'client_id': client_id,
        'client_secret': client_secret,
        'refresh_token': refresh_token
    }

    try:
        response = requests.post(url, headers=headers, data=data)
        if response.status_code == 200:
            res_data = response.json()
            config.set_access_token(res_data['access_token'])
            config.set_refresh_token(res_data['refresh_token'])
            config.set_token_expiry(time.time() + res_data['expires_in'])
            return True
        else:
            return False
    except Exception:
        return False

def check_and_refresh_token():
    """Checks if the token is close to expiry and refreshes if needed."""
    expiry = config.get_token_expiry()
    # Refresh if token expires in less than 5 minutes
    if expiry - time.time() < 300:
        return refresh_access_token()
    return True

# --- API Request Wrapper ---

def api_request(method, path, headers=None, params=None, json_data=None):
    """Safely executes an authorized request to Mercado Libre API."""
    if is_demo_mode():
        return None  # Should use mock path instead
        
    check_and_refresh_token()
    
    url = f"{API_BASE_URL}{path}"
    req_headers = {
        'Authorization': f"Bearer {config.get_access_token()}",
        'Accept': 'application/json'
    }
    if headers:
        req_headers.update(headers)
        
    try:
        response = requests.request(method, url, headers=req_headers, params=params, json=json_data)
        return response
    except Exception as e:
        raise ConnectionError(f"Error al conectar con la API de Mercado Libre: {str(e)}")

# --- Sync Data Functions ---

def sync_products():
    """Schedules or triggers synchronization of products from Meli to SQLite Cache."""
    if is_demo_mode():
        # Generate beautiful mock items
        products = []
        for i, title in enumerate(MOCK_TITLES):
            ml_id = f"MLA{987654321 + i}"
            # Standard prices in local currency
            price = float(random.randint(1500, 85000))
            qty = random.randint(0, 25)
            products.append({
                'ml_id': ml_id,
                'title': title,
                'price': price,
                'available_quantity': qty,
                'permalink': f"https://articulo.mercadolibre.com.ar/{ml_id.replace('MLA', 'MLA-')}-articulo-demo",
                'thumbnail': MOCK_THUMBNAILS[i % len(MOCK_THUMBNAILS)],
                'status': 'active' if qty > 0 else 'paused',
                'visits_meli': random.randint(50, 1500),
                'visits_web': random.randint(10, 800)
            })
        database.save_products(products)
        return True, len(products)

    # Real Mercado Libre API flow
    user_id = config.get_user_id()
    if not user_id:
        return False, "Usuario no autenticado"

    try:
        from src.progress import update_progress
        update_progress(status="syncing_products", progress=5, message="Buscando publicaciones en Mercado Libre...", current=0, total=100)
        # Search all active and paused items
        search_path = f"/users/{user_id}/items/search"
        
        all_item_ids = []
        offset = 0
        limit = 50
        
        while True:
            params = {'limit': limit, 'offset': offset}
            update_progress(
                status="syncing_products",
                progress=5 + min(15, int((offset / 500) * 15)),
                message=f"Buscando ids de publicaciones ({len(all_item_ids)} encontradas)..."
            )
            response = api_request("GET", search_path, params=params)
            
            if response.status_code != 200:
                return False, f"No se pudieron buscar publicaciones: {response.text}"
                
            results = response.json().get('results', [])
            if not results:
                break
                
            all_item_ids.extend(results)
            offset += limit
            
        if not all_item_ids:
            update_progress(status="completed", progress=100, message="Sincronización finalizada: No se encontraron publicaciones.")
            return True, 0
            
        item_ids = all_item_ids
            
        # Get details in chunks of 20 (multi-get limit)
        products = []
        total_items = len(item_ids)
        for idx, i in enumerate(range(0, total_items, 20)):
            chunk = item_ids[i:i+20]
            current_progress = 20 + int((idx / max(1, total_items / 20)) * 20)
            update_progress(
                status="syncing_products",
                progress=current_progress,
                message=f"Sincronizando detalles y visitas de productos ({i}/{total_items})...",
                current=i,
                total=total_items
            )
            details_response = api_request("GET", "/items", params={'ids': ",".join(chunk)})
            
            # Fetch visits for the same item IDs. Since /visits/items only supports 1 item per request, we query them in parallel.
            visits_dict = {}
            from concurrent.futures import ThreadPoolExecutor
            
            def fetch_single_visit(item_id):
                try:
                    v_res = api_request("GET", "/visits/items", params={'ids': item_id})
                    if v_res is not None and v_res.status_code == 200:
                        v_data = v_res.json()
                        return item_id, v_data.get(item_id, 0)
                except Exception:
                    pass
                return item_id, 0
                
            with ThreadPoolExecutor(max_workers=5) as executor:
                res_visits = executor.map(fetch_single_visit, chunk)
                for item_id, val in res_visits:
                    visits_dict[item_id] = val
            
            if details_response.status_code == 200:
                results = details_response.json()
                for item_wrapper in results:
                    item = item_wrapper.get('body', {})
                    if item.get('id'):
                        pictures = item.get('pictures', [])
                        images_list = [pic.get('secure_url') or pic.get('url') for pic in pictures if pic.get('secure_url') or pic.get('url')]
                        images_str = ",".join(images_list)
                        
                        products.append({
                            'ml_id': item['id'],
                            'title': item['title'],
                            'price': float(item['price']),
                            'available_quantity': int(item['available_quantity']),
                            'permalink': item.get('permalink'),
                            'thumbnail': item.get('thumbnail'),
                            'status': item.get('status'),
                            'visits_meli': visits_dict.get(item['id'], 0),
                            'images': images_str
                        })
                        
        database.save_products(products)
        update_progress(status="syncing_products", progress=40, message=f"Productos sincronizados: {len(products)} guardados")
        return True, len(products)
    except Exception as e:
        update_progress(status="failed", message=f"Excepción en sincronización de productos: {str(e)}")
        return False, f"Excepción en sincronización: {str(e)}"

def is_recent_order(date_str, max_hours=24):
    """
    Checks if the order was created within the last max_hours.
    Supports standard ISO format dates with timezone offsets or 'Z'.
    """
    try:
        from datetime import timezone
        # Clean up timezone suffix Z to parse with fromisoformat
        cleaned = date_str.replace('Z', '+00:00')
        created_dt = datetime.fromisoformat(cleaned)
        now = datetime.now(created_dt.tzinfo or timezone.utc)
        age = now - created_dt
        return age.total_seconds() < max_hours * 3600
    except Exception as e:
        print(f"[Sync] Error parsing order date '{date_str}': {e}")
        return True # Default to True to avoid skipping messages if parsing fails

def sync_orders(limit=50, date_from=None, date_to=None):
    """Synchronizes sales orders from Meli to SQLite cache."""
    if is_demo_mode():
        # Generate mock orders and customers
        orders = []
        now = datetime.now()
        for i in range(15):
            order_id = 2000000000 + i
            buyer = random.choice(MOCK_BUYERS)
            item_count = random.randint(1, 2)
            items = []
            total_amount = 0.0
            
            # Fetch products from db cache to match items
            db_products = database.get_all_products()
            if not db_products:
                sync_products()
                db_products = database.get_all_products()
                
            for _ in range(item_count):
                prod = random.choice(db_products) if db_products else {
                    'ml_id': 'MLA12345', 'title': 'Producto Demo', 'price': 1000.0
                }
                qty = random.randint(1, 3)
                price = prod['price']
                items.append({
                    'id': prod['ml_id'],
                    'title': prod['title'],
                    'price': price,
                    'quantity': qty
                })
                total_amount += price * qty
                
            # Date offset to spread orders across the past 30 days
            order_date = now - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
            
            orders.append({
                'order_id': order_id,
                'date_created': order_date.isoformat(),
                'buyer': buyer,
                'total_amount': total_amount,
                'currency_id': 'ARS',
                'status': 'paid' if i < 12 else 'cancelled',
                'payment_status': 'approved' if i < 12 else 'rejected',
                'shipping_status': 'delivered' if i < 8 else ('shipped' if i < 11 else 'pending'),
                'items': items
            })
        database.save_orders_and_customers(orders)
        return True, len(orders)

    # Real Mercado Libre API flow
    user_id = config.get_user_id()
    if not user_id:
        return False, "Usuario no autenticado"

    try:
        from src.progress import update_progress
        update_progress(status="syncing_sales", progress=40, message="Buscando ventas en Mercado Libre...", current=0, total=limit)
        # Get recent seller orders
        search_path = f"/orders/search"
        all_results = []
        offset = 0
        
        while offset < limit:
            chunk_limit = min(50, limit - offset)
            params = {
                'seller': user_id,
                'limit': chunk_limit,
                'offset': offset,
                'sort': 'date_desc'
            }
            if date_from:
                params['order.date_created.from'] = date_from
            if date_to:
                params['order.date_created.to'] = date_to
                
            # Progress between 40% and 95%
            current_progress = 40 + int((offset / max(1, limit)) * 55)
            update_progress(
                status="syncing_sales",
                progress=current_progress,
                message=f"Buscando ventas de Mercado Libre ({offset}/{limit})...",
                current=offset,
                total=limit
            )
            response = api_request("GET", search_path, params=params)
            
            if response.status_code != 200:
                return False, f"No se pudieron buscar órdenes: {response.text}"
                
            results = response.json().get('results', [])
            if not results:
                break
                
            all_results.extend(results)
            offset += len(results)
            
        orders = []
        
        for o in all_results:
            items = []
            for item_wrapper in o.get('order_items', []):
                item_details = item_wrapper.get('item', {})
                items.append({
                    'id': item_details.get('id'),
                    'title': item_details.get('title'),
                    'price': float(item_wrapper.get('unit_price', 0.0)),
                    'quantity': int(item_wrapper.get('quantity', 1))
                })
                
            buyer_info = o.get('buyer', {})
            # Document details mapping
            doc_type = None
            doc_num = None
            billing_info = buyer_info.get('billing_info', {})
            if billing_info.get('doc_type'):
                doc_type = billing_info['doc_type']
                doc_num = billing_info.get('doc_number')
            
            buyer = {
                'id': buyer_info.get('id'),
                'nickname': buyer_info.get('nickname', 'Anónimo'),
                'name': f"{buyer_info.get('first_name', '')} {buyer_info.get('last_name', '')}".strip() or buyer_info.get('nickname', 'Comprador Meli'),
                'email': buyer_info.get('email'),
                'phone': buyer_info.get('phone', {}).get('number'),
                'document_type': doc_type,
                'document_number': doc_num
            }
            
            # Shipping and Payment statuses
            tags = o.get('tags', [])
            if 'delivered' in tags:
                shipping_status = 'delivered'
            elif 'shipped' in tags:
                shipping_status = 'shipped'
            else:
                shipping_status = o.get('shipping', {}).get('status')
                if not shipping_status:
                    shipping_status = 'pending'
            payment_status = 'pending'
            payment_method = 'unknown'
            payments = o.get('payments', [])
            if payments:
                payment_status = payments[0].get('status', 'pending')
                payment_method_raw = payments[0].get('payment_method_id', 'unknown')
                
                # Simple mapping for display
                payment_method_map = {
                    'account_money': 'Mercado Pago (Dinero en cuenta)',
                    'rapipago': 'Rapipago',
                    'pagofacil': 'Pago Fácil',
                    'redlink': 'Red Link',
                    'visa': 'Visa',
                    'master': 'Mastercard',
                    'amex': 'Amex',
                    'cabal': 'Cabal',
                    'unknown': 'Desconocido'
                }
                payment_method = payment_method_map.get(payment_method_raw, payment_method_raw.capitalize())
                
            orders.append({
                'order_id': o['id'],
                'date_created': o['date_created'],
                'buyer': buyer,
                'total_amount': float(o['total_amount']),
                'currency_id': o.get('currency_id', 'ARS'),
                'status': o['status'],
                'payment_status': payment_status,
                'payment_method': payment_method,
                'shipping_status': shipping_status,
                'items': items,
                'meli_invoice_attached': 0
            })
            
        # Check attached invoices in parallel
        from concurrent.futures import ThreadPoolExecutor
        update_progress(status="syncing_sales", progress=95, message="Verificando facturas adjuntas en Mercado Libre...")
        
        def check_invoice(order_dict):
            order_dict['meli_invoice_attached'] = 1 if check_meli_invoice_exists(order_dict['order_id']) else 0
            return order_dict
            
        with ThreadPoolExecutor(max_workers=5) as executor:
            orders = list(executor.map(check_invoice, orders))
            
        # Check which orders are new, and which orders transitioned to shipped
        new_order_ids = []
        shipped_order_ids = []
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                for o in orders:
                    cursor.execute("SELECT shipping_status, shipping_msg_sent FROM orders_cache WHERE order_id = %s", (o['order_id'],))
                    row = cursor.fetchone()
                    if not row:
                        new_order_ids.append(o['order_id'])
                        if o['shipping_status'] == 'shipped':
                            shipped_order_ids.append(o['order_id'])
                    else:
                        old_status = row['shipping_status']
                        msg_sent = row['shipping_msg_sent']
                        if o['shipping_status'] == 'shipped' and old_status != 'shipped' and not msg_sent:
                            shipped_order_ids.append(o['order_id'])

        database.save_orders_and_customers(orders)

        # Send automatic post-sale purchase message for new orders
        send_purchase_enabled = database.get_setting('meli_send_purchase_msg', '1') == '1'
        purchase_msg = database.get_setting('meli_msg_purchase', '')
        if send_purchase_enabled and purchase_msg:
            for order_id in new_order_ids:
                # Find the order in the synced list to check its creation date
                order_info = next((ord for ord in orders if ord['order_id'] == order_id), None)
                if order_info and not is_recent_order(order_info['date_created'], max_hours=24):
                    print(f"[Sync] Evitando enviar mensaje automático de compra para orden antigua {order_id} ({order_info['date_created']})")
                    continue
                ok_msg, info_msg = send_post_sale_message(order_id, purchase_msg)
                if not ok_msg:
                    print(f"[Sync] Error al enviar mensaje de compra para {order_id}: {info_msg}")

        # Send automatic shipping tracking message for transitioned orders
        send_shipping_enabled = database.get_setting('meli_send_shipping_msg', '1') == '1'
        shipping_msg = database.get_setting('meli_msg_shipping', '')
        if send_shipping_enabled and shipping_msg:
            for order_id in shipped_order_ids:
                # Find the order in the synced list to check its creation date
                order_info = next((ord for ord in orders if ord['order_id'] == order_id), None)
                if order_info and not is_recent_order(order_info['date_created'], max_hours=72):
                    print(f"[Sync] Evitando enviar mensaje automático de envío para orden antigua {order_id} ({order_info['date_created']})")
                    continue
                ok_msg, info_msg = send_post_sale_message(order_id, shipping_msg)
                if ok_msg:
                    with database.get_connection() as conn:
                        with conn.cursor() as cursor:
                            cursor.execute("UPDATE orders_cache SET shipping_msg_sent = 1 WHERE order_id = %s", (order_id,))
                else:
                    print(f"[Sync] Error al enviar mensaje de envío para {order_id}: {info_msg}")

        update_progress(status="completed", progress=100, message="Sincronización finalizada con éxito.")
        return True, len(orders)
    except Exception as e:
        update_progress(status="failed", message=f"Excepción en sincronización de ventas: {str(e)}")
        return False, f"Excepción en sincronización de órdenes: {str(e)}"

def update_stock_and_price(ml_id, quantity, price):
    """Updates the stock quantity and price on Mercado Libre."""
    if is_demo_mode():
        # Update local db cache directly
        database.update_product_stock_price(ml_id, quantity, price)
        return True, "Actualizado en modo Demo exitosamente"
        
    path = f"/items/{ml_id}"
    data = {
        "price": float(price),
        "available_quantity": int(quantity)
    }
    
    try:
        response = api_request("PUT", path, json_data=data)
        if response.status_code == 200:
            database.update_product_stock_price(ml_id, quantity, price)
            return True, "Sincronizado con Mercado Libre"
        else:
            return False, f"Error de API Mercado Libre: {response.text}"
    except Exception as e:
        return False, f"Excepción de red: {str(e)}"

def fetch_order_billing_info(order_id):
    """
    Fetches detailed billing and address info for a Mercado Libre order.
    Returns a dict with document_type, document_number, name, address, and taxpayer_type.
    """
    if is_demo_mode():
        return {
            'document_type': 'CUIT',
            'document_number': '20313832482',
            'name': 'JUAN PEREZ (MOCK)',
            'address': 'Av. Corrientes 1234, Capital Federal, (1043)',
            'taxpayer_type': 'Responsable Inscripto'
        }

    path = f"/orders/{order_id}/billing_info"
    try:
        res = api_request("GET", path)
        if not res or res.status_code != 200:
            return {}
        
        data = res.json()
        billing_info = data.get('billing_info', {})
        if not billing_info:
            return {}
            
        result = {
            'document_type': billing_info.get('doc_type'),
            'document_number': billing_info.get('doc_number'),
            'name': '',
            'address': '',
            'taxpayer_type': 'Consumidor Final'
        }
        
        first_name = ''
        last_name = ''
        street = ''
        number = ''
        city = ''
        state = ''
        zip_code = ''
        
        for item in billing_info.get('additional_info', []):
            t = item.get('type')
            v = item.get('value')
            if not v:
                continue
            if t == 'FIRST_NAME':
                first_name = v
            elif t == 'LAST_NAME':
                last_name = v
            elif t == 'STREET_NAME':
                street = v
            elif t == 'STREET_NUMBER':
                number = v
            elif t == 'CITY_NAME':
                city = v
            elif t == 'STATE_NAME':
                state = v
            elif t == 'ZIP_CODE':
                zip_code = v
            elif t == 'TAXPAYER_TYPE_ID':
                result['taxpayer_type'] = v
                
        if first_name or last_name:
            result['name'] = f"{first_name} {last_name}".strip()
        
        address_parts = []
        if street:
            address_parts.append(f"{street} {number}".strip() if number else street)
        if city:
            address_parts.append(city)
        if state:
            address_parts.append(state)
        if zip_code:
            address_parts.append(f"({zip_code})")
            
        if address_parts:
            result['address'] = ", ".join(address_parts)
            
        return result
    except Exception:
        return {}

def check_meli_invoice_exists(order_id):
    """
    Verifica rápidamente si existe una factura adjunta en Mercado Libre para la venta.
    """
    if is_demo_mode():
        return False
    try:
        path = f"/billing/integration/group/{order_id}/documents"
        res = api_request("GET", path)
        if res and res.status_code == 200:
            data = res.json()
            if data.get('fiscal_documents') or data.get('documents'):
                return True
        # Si falla o no existe en billing/integration, intentamos con el endpoint de fiscal_documents
        # ML usa /packs/{pack_id}/fiscal_documents incluso para órdenes individuales (usando order_id como pack_id)
        res2 = api_request("GET", f"/packs/{order_id}/fiscal_documents")
        if res2 and res2.status_code == 200:
            docs_data = res2.json()
            # el formato de packs/{id}/fiscal_documents devuelve un objeto con "fiscal_documents": [...]
            if isinstance(docs_data, dict) and "fiscal_documents" in docs_data:
                fiscal_docs = docs_data["fiscal_documents"]
                if fiscal_docs and len(fiscal_docs) > 0 and fiscal_docs[0].get("id"):
                    return True
            
            # (fallback legacy si devuelve array)
            if isinstance(docs_data, list) and len(docs_data) > 0 and docs_data[0].get("id"):
                return True
    except Exception:
        pass
    return False

def download_meli_invoice(order_id):
    """
    Descarga la factura adjunta en Mercado Libre para una venta.
    Retorna el contenido binario del PDF (bytes) o None si no existe o falla.
    """
    if is_demo_mode():
        return None

    path = f"/billing/integration/group/{order_id}/documents"
    try:
        res = api_request("GET", path)
        if not res or res.status_code != 200:
            # Fallback a endpoint de packs
            res2 = api_request("GET", f"/packs/{order_id}/fiscal_documents")
            if not res2 or res2.status_code != 200:
                return None
                
            docs_data = res2.json()
            doc_id = None
            
            if isinstance(docs_data, dict) and "fiscal_documents" in docs_data:
                fiscal_docs = docs_data["fiscal_documents"]
                if fiscal_docs and len(fiscal_docs) > 0:
                    doc_id = fiscal_docs[0].get('id')
            elif isinstance(docs_data, list) and len(docs_data) > 0:
                doc_id = docs_data[0].get('id')
                
            if doc_id:
                dl_res = api_request("GET", f"/packs/{order_id}/fiscal_documents/{doc_id}")
                if dl_res and dl_res.status_code == 200:
                    return dl_res.content
            return None
            
        data = res.json()
        documents = data.get('fiscal_documents', [])
        if not documents:
            # Algunas respuestas de ML tienen la key 'documents' en vez de 'fiscal_documents'
            documents = data.get('documents', [])
            
        if not documents:
            return None
            
        # Tomamos el primer documento
        doc = documents[0]
        file_id = doc.get('file_id') or doc.get('id')
            
        if file_id:
            # Descargamos el archivo propiamente dicho
            dl_path = f"{path}/{file_id}/download"
            dl_res = api_request("GET", dl_path)
            if dl_res and dl_res.status_code == 200:
                return dl_res.content
                
        return None
    except Exception as e:
        print(f"Error descargando factura de ML para order_id={order_id}: {e}")
        return None


def upload_invoice_to_meli(order_id, pdf_path):
    """
    Sube la factura PDF generada a Mercado Libre como documento fiscal adjunto.
    Usa POST multipart/form-data a /packs/{order_id}/fiscal_documents.
    Retorna (success: bool, message: str).
    """
    if is_demo_mode():
        return True, "Factura adjuntada (modo demo)"

    if not os.path.exists(pdf_path):
        return False, f"El archivo PDF no existe: {pdf_path}"

    try:
        check_and_refresh_token()
        access_token = config.get_access_token()
        if not access_token:
            return False, "No hay token de acceso válido para Mercado Libre"

        url = f"{API_BASE_URL}/packs/{order_id}/fiscal_documents"
        headers = {
            'Authorization': f"Bearer {access_token}"
        }

        # Try with the order_id first
        with open(pdf_path, 'rb') as f:
            files = {
                'fiscal_document': (os.path.basename(pdf_path), f, 'application/pdf')
            }
            response = requests.post(url, headers=headers, files=files, timeout=30)

        # If it says order belongs to a pack, we need to fetch the pack_id and retry
        if response.status_code == 400:
            try:
                err_data = response.json()
                is_pack_error = (
                    err_data.get('error') == 'order_belong_pack' or
                    'order_belong_pack' in response.text or
                    'order belong to a pack' in response.text
                )
                if is_pack_error:
                    # Fetch the order details to get the pack_id
                    order_res = api_request("GET", f"/orders/{order_id}")
                    if order_res and order_res.status_code == 200:
                        order_data = order_res.json()
                        pack_id = order_data.get('pack_id')
                        if pack_id:
                            # Retry with pack_id
                            url_pack = f"{API_BASE_URL}/packs/{pack_id}/fiscal_documents"
                            with open(pdf_path, 'rb') as f:
                                files_pack = {
                                    'fiscal_document': (os.path.basename(pdf_path), f, 'application/pdf')
                                }
                                response = requests.post(url_pack, headers=headers, files=files_pack, timeout=30)
                        else:
                            print(f"[Pack Retry] pack_id not found in order {order_id}")
                    else:
                        status_code = order_res.status_code if order_res else "No response"
                        print(f"[Pack Retry] Failed to get order {order_id} details, status={status_code}")
            except Exception as e:
                print(f"Error trying to fetch pack_id for order {order_id}: {e}")

        if response.status_code in (200, 201):
            # Update meli_invoice_attached in DB
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "UPDATE orders_cache SET meli_invoice_attached = 1 WHERE order_id = %s",
                        (order_id,)
                    )
            # Send post-sale message
            send_invoice_enabled = database.get_setting('meli_send_invoice_msg', '1') == '1'
            if send_invoice_enabled:
                msg_text = database.get_setting('meli_msg_invoice', 'Hola, gracias por tu compra. Te informamos que ya adjuntamos tu factura digital a los detalles de tu compra. ¡Saludos!')
                ok_msg, info_msg = send_post_sale_message(order_id, msg_text)
                if not ok_msg:
                    print(f"Advertencia: No se pudo enviar el mensaje posventa para order {order_id}: {info_msg}")
                
            return True, "Factura adjuntada en Mercado Libre exitosamente"
        else:
            error_detail = ""
            try:
                err_data = response.json()
                error_detail = err_data.get('message', '') or err_data.get('error', '') or str(err_data)
            except Exception:
                error_detail = response.text[:200]
            return False, f"Error al adjuntar en ML (HTTP {response.status_code}): {error_detail}"

    except Exception as e:
        return False, f"Error de conexión al adjuntar factura en ML: {str(e)}"


def send_post_sale_message(order_id, text_content):
    """
    Envia un mensaje de posventa al chat de la orden de Mercado Libre.
    Resuelve el pack_id y el seller_id correspondientes.
    """
    if is_demo_mode():
        return True, "Mensaje enviado (modo demo)"
        
    try:
        check_and_refresh_token()
        access_token = config.get_access_token()
        seller_id = config.get_user_id()
        if not access_token or not seller_id:
            return False, "Falta token o seller_id de Mercado Libre para enviar mensaje"

        # Resolving pack_id and buyer_id
        pack_id = order_id
        buyer_id = None
        order_res = api_request("GET", f"/orders/{order_id}")
        if order_res and order_res.status_code == 200:
            order_data = order_res.json()
            pack_id = order_data.get('pack_id') or order_id
            buyer_id = order_data.get('buyer', {}).get('id')

        if not buyer_id:
            # Fallback to local DB cache
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT buyer_id FROM orders_cache WHERE order_id = %s", (order_id,))
                    row = cursor.fetchone()
                    if row:
                        buyer_id = row['buyer_id']

        url = f"{API_BASE_URL}/messages/packs/{pack_id}/sellers/{seller_id}?tag=post_sale"
        headers = {
            'Authorization': f"Bearer {access_token}",
            'Content-Type': 'application/json'
        }
        seller_user_id = int(seller_id) if str(seller_id).isdigit() else seller_id
        payload = {
            "text": text_content,
            "from": {
                "user_id": seller_user_id
            }
        }
        if buyer_id:
            payload["to"] = {
                "user_id": int(buyer_id) if str(buyer_id).isdigit() else buyer_id
            }
        res = requests.post(url, headers=headers, json=payload, timeout=20)
        if res.status_code in (200, 201):
            return True, "Mensaje de posventa enviado con éxito"
        else:
            err_msg = ""
            try:
                err_msg = res.json().get('message') or res.text[:200]
            except Exception:
                err_msg = res.text[:200]
            return False, f"Error de Mercado Libre ({res.status_code}): {err_msg}"
    except Exception as e:
        return False, f"Error al enviar mensaje posventa: {str(e)}"
