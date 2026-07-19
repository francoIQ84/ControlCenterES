import time
import requests
import json
from datetime import datetime, timedelta
import random

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
        # Search all active and paused items
        search_path = f"/users/{user_id}/items/search"
        
        all_item_ids = []
        offset = 0
        limit = 50
        
        while True:
            params = {'limit': limit, 'offset': offset}
            response = api_request("GET", search_path, params=params)
            
            if response.status_code != 200:
                return False, f"No se pudieron buscar publicaciones: {response.text}"
                
            results = response.json().get('results', [])
            if not results:
                break
                
            all_item_ids.extend(results)
            offset += limit
            
        if not all_item_ids:
            return True, 0
            
        item_ids = all_item_ids
            
        # Get details in chunks of 20 (multi-get limit)
        products = []
        for i in range(0, len(item_ids), 20):
            chunk = item_ids[i:i+20]
            ids_str = ",".join(chunk)
            details_response = api_request("GET", "/items", params={'ids': ids_str})
            
            # Fetch visits for the same item IDs
            visits_response = api_request("GET", "/items/visits", params={'ids': ids_str})
            visits_dict = {}
            if visits_response and visits_response.status_code == 200:
                visits_dict = visits_response.json()
            
            if details_response.status_code == 200:
                results = details_response.json()
                for item_wrapper in results:
                    item = item_wrapper.get('body', {})
                    if item.get('id'):
                        products.append({
                            'ml_id': item['id'],
                            'title': item['title'],
                            'price': float(item['price']),
                            'available_quantity': int(item['available_quantity']),
                            'permalink': item.get('permalink'),
                            'thumbnail': item.get('thumbnail'),
                            'status': item.get('status'),
                            'visits_meli': visits_dict.get(item['id'], 0)
                        })
                        
        database.save_products(products)
        return True, len(products)
    except Exception as e:
        return False, f"Excepción en sincronización: {str(e)}"

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
                'items': items
            })
            
        database.save_orders_and_customers(orders)
        return True, len(orders)
    except Exception as e:
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
