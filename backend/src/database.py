import os
import json
from datetime import datetime
import hashlib
import secrets
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/controlcenter')

def get_connection():
    """Returns a psycopg2 connection to the database."""
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    conn.autocommit = True
    return conn

def init_db():
    """Initializes the PostgreSQL database and creates the necessary tables if they don't exist."""
    # Settings table
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')

            # Products cache table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS products_cache (
                    ml_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    price REAL NOT NULL,
                    available_quantity INTEGER NOT NULL,
                    cost_price REAL DEFAULT 0.0,
                    permalink TEXT,
                    thumbnail TEXT,
                    status TEXT,
                    last_sync TEXT,
                    price_web REAL DEFAULT 0.0,
                    images TEXT,
                    description TEXT,
                    is_web_active INTEGER DEFAULT 0
                )
            ''')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS visits_meli INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS visits_web INTEGER DEFAULT 0;')

            # Categories table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS categories (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    slug VARCHAR(100) UNIQUE NOT NULL
                )
            ''')

            # Web visits log table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS web_visits_log (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ml_id TEXT,
                    domain TEXT,
                    ip_address TEXT,
                    country TEXT
                )
            ''')
            # Add category_id to products_cache
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS sync_meli INTEGER DEFAULT 1;')

            # Orders cache table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS orders_cache (
                    order_id BIGINT PRIMARY KEY,
                    date_created TEXT,
                    buyer_id BIGINT,
                    buyer_nickname TEXT,
                    buyer_name TEXT,
                    total_amount REAL,
                    currency_id TEXT,
                    status TEXT,
                    payment_status TEXT,
                    shipping_status TEXT,
                    items_json TEXT,
                    invoice_generated INTEGER DEFAULT 0,
                    source_platform TEXT DEFAULT 'MERCADOLIBRE',
                    payment_method TEXT
                )
            ''')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS payment_method TEXT;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS invoice_number TEXT;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS afip_cae TEXT;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS afip_cae_exp TEXT;')

            # Customers table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS customers (
                    buyer_id BIGINT PRIMARY KEY,
                    nickname TEXT,
                    full_name TEXT,
                    email TEXT,
                    phone TEXT,
                    document_type TEXT,
                    document_number TEXT,
                    source_platform TEXT DEFAULT 'MERCADOLIBRE'
                )
            ''')
            cursor.execute('ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;')


            # Users table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    full_name VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Active Sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS active_sessions (
                    token VARCHAR(255) PRIMARY KEY,
                    user_id INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP
                )
            ''')
            cursor.execute('ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER;')

            # Login History table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS login_history (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    username VARCHAR(100),
                    ip_address VARCHAR(50),
                    country VARCHAR(100),
                    region VARCHAR(100),
                    city VARCHAR(100),
                    status VARCHAR(20),
                    user_agent TEXT
                )
            ''')

            # Fixed Expenses table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS fixed_expenses (
                    id SERIAL PRIMARY KEY,
                    description VARCHAR(255) NOT NULL,
                    amount REAL NOT NULL,
                    category VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Variable Expenses table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS variable_expenses (
                    id SERIAL PRIMARY KEY,
                    date DATE NOT NULL,
                    description VARCHAR(255) NOT NULL,
                    amount REAL NOT NULL,
                    category VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('ALTER TABLE login_history ADD COLUMN IF NOT EXISTS username VARCHAR(100);')

            # Seed default admin user if no users exist
            cursor.execute("SELECT COUNT(*) as count FROM users")
            if cursor.fetchone()['count'] == 0:
                admin_pw_hash = hash_password("admin123")
                cursor.execute('''
                    INSERT INTO users (username, password_hash, full_name)
                    VALUES (%s, %s, %s)
                ''', ("admin", admin_pw_hash, "Administrador"))

# --- Categories Operations ---

def get_all_categories():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name, slug FROM categories ORDER BY name ASC")
            return cursor.fetchall()

def create_category(name: str, slug: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO categories (name, slug) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE SET slug = EXCLUDED.slug RETURNING id", (name, slug))
            return cursor.fetchone()['id']

def delete_category(category_id: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET category_id = NULL WHERE category_id = %s", (category_id,))
            cursor.execute("DELETE FROM categories WHERE id = %s", (category_id,))

# --- Settings Operations ---

def get_setting(key, default=None):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT value FROM settings WHERE key = %s", (key,))
                row = cursor.fetchone()
                return row['value'] if row else default
    except psycopg2.Error:
        return default

def set_setting(key, value):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO settings (key, value) VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            ''', (key, str(value)))

def delete_setting(key):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM settings WHERE key = %s", (key,))

# --- Products Operations ---

def save_products(products_list):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for p in products_list:
                cursor.execute("SELECT cost_price, price_web, images, description, is_web_active, visits_web FROM products_cache WHERE ml_id = %s", (p['ml_id'],))
                row = cursor.fetchone()
                cost_price = row['cost_price'] if row else 0.0
                price_web = row['price_web'] if row else 0.0
                images = row['images'] if (row and row['images']) else p.get('images', '')
                description = row['description'] if row else ''
                is_web_active = row['is_web_active'] if row else 0
                visits_web = row['visits_web'] if row else p.get('visits_web', 0)
                
                visits_meli = p.get('visits_meli', 0)

                cursor.execute('''
                    INSERT INTO products_cache 
                    (ml_id, title, price, available_quantity, cost_price, permalink, thumbnail, status, last_sync, price_web, images, description, is_web_active, visits_meli, visits_web)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ml_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        price = EXCLUDED.price,
                        available_quantity = EXCLUDED.available_quantity,
                        permalink = EXCLUDED.permalink,
                        thumbnail = EXCLUDED.thumbnail,
                        status = EXCLUDED.status,
                        last_sync = EXCLUDED.last_sync,
                        visits_meli = EXCLUDED.visits_meli,
                        images = CASE WHEN products_cache.images IS NULL OR products_cache.images = '' THEN EXCLUDED.images ELSE products_cache.images END
                ''', (p['ml_id'], p['title'], p['price'], p['available_quantity'], cost_price, 
                      p.get('permalink'), p.get('thumbnail'), p.get('status'), now, price_web, images, description, is_web_active, visits_meli, visits_web))

def create_product(product_data):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO products_cache 
                (ml_id, title, price, available_quantity, cost_price, permalink, thumbnail, status, last_sync, price_web, images, description, is_web_active, visits_meli, visits_web, category_id, sync_meli)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                product_data['ml_id'],
                product_data['title'],
                product_data['price'],
                product_data['available_quantity'],
                product_data.get('cost_price', 0.0),
                product_data.get('permalink', ''),
                product_data.get('thumbnail', ''),
                product_data.get('status', 'active'),
                now,
                product_data.get('price_web', 0.0),
                product_data.get('images', ''),
                product_data.get('description', ''),
                product_data.get('is_web_active', 1),
                product_data.get('visits_meli', 0),
                product_data.get('visits_web', 0),
                product_data.get('category_id'),
                product_data.get('sync_meli', 1)
            ))

def update_product_cost(ml_id, cost_price):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET cost_price = %s WHERE ml_id = %s", (cost_price, ml_id))

def update_product_stock_price(ml_id, quantity, price):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET available_quantity = %s, price = %s WHERE ml_id = %s", (quantity, price, ml_id))

def update_product_web_details(ml_id, price_web, images, description, is_web_active, category_id=None, sync_meli=1):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                UPDATE products_cache 
                SET price_web = %s, images = %s, description = %s, is_web_active = %s, category_id = %s, sync_meli = %s
                WHERE ml_id = %s
            ''', (price_web, images, description, is_web_active, category_id, sync_meli, ml_id))

def get_all_products(query=None, status_filter=None, is_web_active=None, category_slug=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            sql = """
                SELECT p.ml_id, p.title, p.price, p.available_quantity, p.cost_price, p.permalink, p.thumbnail, 
                       p.status, p.last_sync, p.price_web, p.images, p.description, p.is_web_active, 
                       p.visits_meli, p.visits_web, p.category_id, p.sync_meli, c.name as category_name, c.slug as category_slug
                FROM products_cache p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE 1=1
            """
            params = []
            
            if query:
                sql += " AND (p.title ILIKE %s OR p.ml_id ILIKE %s)"
                params.extend([f"%{query}%", f"%{query}%"])
                
            if status_filter:
                sql += " AND p.status = %s"
                params.append(status_filter)
                
            if is_web_active is not None:
                sql += " AND p.is_web_active = %s"
                params.append(is_web_active)
                
            if category_slug:
                sql += " AND c.slug = %s"
                params.append(category_slug)
                
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

# --- Orders & Customers Operations ---

def save_orders_and_customers(orders_list):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for o in orders_list:
                cursor.execute("SELECT invoice_generated, source_platform FROM orders_cache WHERE order_id = %s", (o['order_id'],))
                existing = cursor.fetchone()
                invoice_generated = existing['invoice_generated'] if existing else 0
                source_platform = existing['source_platform'] if existing else o.get('source_platform', 'MERCADOLIBRE')

                cursor.execute('''
                    INSERT INTO orders_cache 
                    (order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform, payment_method)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (order_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        payment_status = EXCLUDED.payment_status,
                        shipping_status = EXCLUDED.shipping_status,
                        payment_method = EXCLUDED.payment_method
                ''', (
                    o['order_id'], o['date_created'], o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
                    o['total_amount'], o['currency_id'], o['status'], o['payment_status'], o['shipping_status'],
                    json.dumps(o['items']), invoice_generated, source_platform, o.get('payment_method')
                ))
                
                cursor.execute('''
                    INSERT INTO customers 
                    (buyer_id, nickname, full_name, email, phone, document_type, document_number, address, source_platform)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (buyer_id) DO UPDATE SET
                        nickname = EXCLUDED.nickname,
                        full_name = EXCLUDED.full_name,
                        email = CASE WHEN EXCLUDED.email IS NOT NULL AND EXCLUDED.email != '' THEN EXCLUDED.email ELSE customers.email END,
                        phone = CASE WHEN EXCLUDED.phone IS NOT NULL AND EXCLUDED.phone != '' THEN EXCLUDED.phone ELSE customers.phone END,
                        document_type = CASE WHEN EXCLUDED.document_type IS NOT NULL AND EXCLUDED.document_type != '' THEN EXCLUDED.document_type ELSE customers.document_type END,
                        document_number = CASE WHEN EXCLUDED.document_number IS NOT NULL AND EXCLUDED.document_number != '' THEN EXCLUDED.document_number ELSE customers.document_number END,
                        address = CASE WHEN EXCLUDED.address IS NOT NULL AND EXCLUDED.address != '' THEN EXCLUDED.address ELSE customers.address END
                ''', (
                    o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
                    o['buyer'].get('email'), o['buyer'].get('phone'),
                    o['buyer'].get('document_type'), o['buyer'].get('document_number'),
                    o['buyer'].get('address'),
                    o.get('source_platform', 'MERCADOLIBRE')
                ))


def update_order_invoice_status(order_id, status=1):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE orders_cache SET invoice_generated = %s WHERE order_id = %s", (status, order_id))

def get_order_by_id(order_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT o.order_id, o.date_created, o.buyer_id, o.buyer_nickname, o.buyer_name, o.total_amount, o.currency_id, o.status, 
                       o.payment_status, o.shipping_status, o.items_json, o.invoice_generated, o.source_platform, o.payment_method, 
                       o.invoice_number, o.afip_cae, o.afip_cae_exp, c.document_type, c.document_number, c.address 
                FROM orders_cache o
                LEFT JOIN customers c ON o.buyer_id = c.buyer_id
                WHERE o.order_id = %s
            """, (order_id,))
            r = cursor.fetchone()
            if not r:
                return None
            return {
                'order_id': r['order_id'],
                'date_created': r['date_created'],
                'buyer': {
                    'id': r['buyer_id'],
                    'nickname': r['buyer_nickname'],
                    'name': r['buyer_name'],
                    'document_type': r.get('document_type', ''),
                    'document_number': r.get('document_number', ''),
                    'address': r.get('address', '')
                },
                'total_amount': r['total_amount'],
                'currency_id': r['currency_id'],
                'status': r['status'],
                'payment_status': r['payment_status'],
                'payment_method': r['payment_method'],
                'shipping_status': r['shipping_status'],
                'items': json.loads(r['items_json']),
                'invoice_generated': bool(r['invoice_generated']),
                'source_platform': r['source_platform'],
                'invoice_number': r.get('invoice_number', ''),
                'afip_cae': r.get('afip_cae', ''),
                'afip_cae_exp': r.get('afip_cae_exp', '')
            }

def get_last_invoice_number_for_pto(pto_vta, cbte_tipo):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT invoice_number FROM orders_cache WHERE invoice_number LIKE %s", (f"{pto_vta:04d}-%",))
            rows = cursor.fetchall()
            max_num = 0
            for r in rows:
                if r['invoice_number'] and '-' in r['invoice_number']:
                    try:
                        num_str = r['invoice_number'].split('-')[1]
                        num = int(num_str)
                        if num > max_num:
                            max_num = num
                    except (IndexError, ValueError):
                        pass
            return max_num

def save_order_afip_details(order_id, invoice_number, cae, cae_exp):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                UPDATE orders_cache 
                SET invoice_generated = 1, invoice_number = %s, afip_cae = %s, afip_cae_exp = %s 
                WHERE order_id = %s
            ''', (invoice_number, cae, cae_exp, order_id))

def get_all_orders(source_platform=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            if source_platform:
                cursor.execute("""
                    SELECT o.order_id, o.date_created, o.buyer_id, o.buyer_nickname, o.buyer_name, o.total_amount, o.currency_id, o.status, 
                           o.payment_status, o.shipping_status, o.items_json, o.invoice_generated, o.source_platform, o.payment_method,
                           o.invoice_number, o.afip_cae, o.afip_cae_exp, c.document_type, c.document_number, c.address
                    FROM orders_cache o
                    LEFT JOIN customers c ON o.buyer_id = c.buyer_id
                    WHERE o.source_platform = %s 
                    ORDER BY o.date_created DESC
                """, (source_platform,))
            else:
                cursor.execute("""
                    SELECT o.order_id, o.date_created, o.buyer_id, o.buyer_nickname, o.buyer_name, o.total_amount, o.currency_id, o.status, 
                           o.payment_status, o.shipping_status, o.items_json, o.invoice_generated, o.source_platform, o.payment_method,
                           o.invoice_number, o.afip_cae, o.afip_cae_exp, c.document_type, c.document_number, c.address
                    FROM orders_cache o
                    LEFT JOIN customers c ON o.buyer_id = c.buyer_id
                    ORDER BY o.date_created DESC
                """)
            rows = cursor.fetchall()
            
            orders = []
            for r in rows:
                orders.append({
                    'order_id': r['order_id'],
                    'date_created': r['date_created'],
                    'buyer': {
                        'id': r['buyer_id'],
                        'nickname': r['buyer_nickname'],
                        'name': r['buyer_name'],
                        'document_type': r.get('document_type', ''),
                        'document_number': r.get('document_number', ''),
                        'address': r.get('address', '')
                    },
                    'total_amount': r['total_amount'],
                    'currency_id': r['currency_id'],
                    'status': r['status'],
                    'payment_status': r['payment_status'],
                    'payment_method': r['payment_method'],
                    'shipping_status': r['shipping_status'],
                    'items': json.loads(r['items_json']),
                    'invoice_generated': bool(r['invoice_generated']),
                    'source_platform': r['source_platform'],
                    'invoice_number': r.get('invoice_number', ''),
                    'afip_cae': r.get('afip_cae', ''),
                    'afip_cae_exp': r.get('afip_cae_exp', '')
                })
            return orders

def get_all_customers():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT 
                    c.buyer_id, c.nickname, c.full_name, c.email, c.phone, c.document_type, c.document_number, c.source_platform,
                    COUNT(o.order_id) as total_orders,
                    SUM(o.total_amount) as total_spent
                FROM customers c
                LEFT JOIN orders_cache o ON c.buyer_id = o.buyer_id
                GROUP BY c.buyer_id
                ORDER BY total_spent DESC
            ''')
            rows = cursor.fetchall()
            
            customers = []
            for r in rows:
                customers.append({
                    'buyer_id': r['buyer_id'],
                    'nickname': r['nickname'],
                    'full_name': r['full_name'],
                    'email': r['email'],
                    'phone': r['phone'],
                    'document_type': r['document_type'],
                    'document_number': r['document_number'],
                    'total_orders': r['total_orders'] or 0,
                    'total_spent': r['total_spent'] or 0.0,
                    'source_platform': r['source_platform']
                })
            return customers

# --- Metrics Operations ---

def increment_product_web_visits(ml_id, domain=None, ip_address=None):
    country = "Desconocido"
    if ip_address and ip_address not in ("127.0.0.1", "localhost", "::1") and not ip_address.startswith("192.168."):
        try:
            import requests
            res = requests.get(f"http://ip-api.com/json/{ip_address}", timeout=2.0)
            if res.status_code == 200:
                data = res.json()
                if data.get("status") == "success":
                    country = data.get("country", "Desconocido")
        except Exception:
            pass

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET visits_web = visits_web + 1 WHERE ml_id = %s", (ml_id,))
            cursor.execute(
                "INSERT INTO web_visits_log (ml_id, domain, ip_address, country) VALUES (%s, %s, %s, %s)",
                (ml_id, domain or "hidroponiarosario.com", ip_address or "127.0.0.1", country)
            )

def get_dashboard_metrics(period="total"):
    from datetime import datetime, timedelta
    date_filter = ""
    params = []
    start_date = None
    
    if period != "total":
        now = datetime.now()
        if period == "day":
            start_date = now - timedelta(days=1)
        elif period == "week":
            start_date = now - timedelta(days=7)
        elif period == "month":
            start_date = now - timedelta(days=30)
        elif period == "year":
            start_date = now - timedelta(days=365)
            
        if start_date:
            date_filter = " AND date_created >= %s"
            params.append(start_date.isoformat())

    with get_connection() as conn:
        with conn.cursor() as cursor:
            sales_query = "SELECT COUNT(order_id) as count, SUM(total_amount) as total FROM orders_cache WHERE status = 'paid'" + date_filter
            cursor.execute(sales_query, tuple(params))
            sales_row = cursor.fetchone()
            total_sales = sales_row['count'] or 0
            total_revenue = sales_row['total'] or 0.0
            
            cursor.execute("SELECT COUNT(ml_id) as count FROM products_cache WHERE status = 'active'")
            total_active_products = cursor.fetchone()['count'] or 0
            
            items_query = "SELECT items_json FROM orders_cache WHERE status = 'paid'" + date_filter
            cursor.execute(items_query, tuple(params))
            orders_items = cursor.fetchall()
            
            cursor.execute("SELECT ml_id, cost_price FROM products_cache")
            costs = {r['ml_id']: r['cost_price'] for r in cursor.fetchall()}
            
            total_cost = 0.0
            for row in orders_items:
                items = json.loads(row['items_json'])
                for item in items:
                    ml_id = item.get('id')
                    quantity = item.get('quantity', 1)
                    cost = costs.get(ml_id, 0.0)
                    total_cost += cost * quantity
                    
            # --- EXPENSES CALCULATION ---
            # Variable expenses for the period
            var_query = "SELECT SUM(amount) as total FROM variable_expenses"
            var_params = []
            if start_date:
                var_query += " WHERE date >= %s"
                var_params.append(start_date.date().isoformat())
            cursor.execute(var_query, tuple(var_params))
            var_row = cursor.fetchone()
            total_var_expenses = var_row['total'] if var_row and var_row['total'] else 0.0
            
            # Fixed expenses (prorated by period)
            cursor.execute("SELECT SUM(amount) as total FROM fixed_expenses")
            fixed_row = cursor.fetchone()
            total_fixed_monthly = fixed_row['total'] if fixed_row and fixed_row['total'] else 0.0
            
            total_fixed_expenses = 0.0
            if period == "day":
                total_fixed_expenses = total_fixed_monthly / 30.0
            elif period == "week":
                total_fixed_expenses = total_fixed_monthly / 4.333
            elif period == "month":
                total_fixed_expenses = total_fixed_monthly
            elif period == "year":
                total_fixed_expenses = total_fixed_monthly * 12.0
            else:
                # 'total' period: calculate months since first order
                cursor.execute("SELECT MIN(date_created) as first_date FROM orders_cache")
                first_date_row = cursor.fetchone()
                if first_date_row and first_date_row['first_date']:
                    try:
                        # date_created is typically ISO string
                        dt_str = first_date_row['first_date'].replace("Z", "+00:00")
                        # Handle potential fractional seconds
                        if '.' in dt_str and '+' in dt_str:
                            first_dt = datetime.fromisoformat(dt_str)
                        else:
                            first_dt = datetime.fromisoformat(dt_str)
                        
                        # Use UTC now for naive comparison if needed, or make it aware
                        now_dt = datetime.now(first_dt.tzinfo) if first_dt.tzinfo else datetime.now()
                        days_active = (now_dt - first_dt).days
                        months_active = max(1.0, days_active / 30.0)
                        total_fixed_expenses = total_fixed_monthly * months_active
                    except Exception:
                        total_fixed_expenses = total_fixed_monthly
                else:
                    total_fixed_expenses = total_fixed_monthly

            total_expenses = total_var_expenses + total_fixed_expenses
            
            # Net profit = Revenue - Product Costs - Expenses
            total_profit = total_revenue - total_cost - total_expenses
            profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0.0
            
            cursor.execute("SELECT COUNT(ml_id) as count FROM products_cache WHERE available_quantity <= 3 AND status = 'active'")
            low_stock_count = cursor.fetchone()['count'] or 0
            
            cursor.execute("SELECT SUM(visits_meli) as meli FROM products_cache")
            visits_row = cursor.fetchone()
            total_visits_meli = (visits_row['meli'] if visits_row else 0) or 0
            
            visit_where = ""
            visit_params = []
            if period != "total" and start_date:
                visit_where = " WHERE timestamp >= %s"
                visit_params.append(start_date)
                
            cursor.execute(f"SELECT COUNT(*) as count FROM web_visits_log{visit_where}", tuple(visit_params))
            logged_visits_web = cursor.fetchone()['count'] or 0
            
            if logged_visits_web > 0 or period != "total":
                total_visits_web = logged_visits_web
            else:
                cursor.execute("SELECT SUM(visits_web) as web FROM products_cache")
                total_visits_web = cursor.fetchone()['web'] or 0

            cursor.execute("SELECT ml_id, title, visits_meli, visits_web FROM products_cache ORDER BY (visits_meli + visits_web) DESC LIMIT 20")
            top_products = [dict(r) for r in cursor.fetchall()]

            cursor.execute(f"SELECT domain, COUNT(*) as count FROM web_visits_log{visit_where} GROUP BY domain ORDER BY count DESC", tuple(visit_params))
            visits_by_domain = [dict(r) for r in cursor.fetchall()]

            cursor.execute(f"SELECT country, COUNT(*) as count FROM web_visits_log{visit_where} GROUP BY country ORDER BY count DESC", tuple(visit_params))
            visits_by_country = [dict(r) for r in cursor.fetchall()]

            return {
                'total_sales': total_sales,
                'total_revenue': total_revenue,
                'total_active_products': total_active_products,
                'total_profit': total_profit,
                'profit_margin': profit_margin,
                'expenses_fixed': total_fixed_expenses,
                'expenses_variable': total_var_expenses,
                'expenses_total': total_expenses,
                'product_costs': total_cost,
                'low_stock_count': low_stock_count,
                'total_visits_meli': total_visits_meli,
                'total_visits_web': total_visits_web,
                'top_products': top_products,
                'visits_by_domain': visits_by_domain,
                'visits_by_country': visits_by_country
            }

def clear_all_caches():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM products_cache")
            cursor.execute("DELETE FROM orders_cache")
            cursor.execute("DELETE FROM customers")

# --- Authentication & Session Security Operations ---

def hash_password(password: str) -> str:
    """Generates a secure PBKDF2 hash of a password using standard hashlib."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"pbkdf2_sha256$100000${salt}${key.hex()}"

def verify_password(password: str, hashed_password: str) -> bool:
    """Safely verifies a password against a PBKDF2 hash using compare_digest."""
    try:
        parts = hashed_password.split('$')
        if len(parts) != 4 or parts[0] != 'pbkdf2_sha256':
            return False
        iterations = int(parts[1])
        salt = parts[2]
        original_key = parts[3]
        key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), iterations)
        return secrets.compare_digest(key.hex(), original_key)
    except Exception:
        return False

def create_session(token, user_id, expires_at):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO active_sessions (token, user_id, expires_at)
                VALUES (%s, %s, %s)
            ''', (token, user_id, expires_at))

def validate_session(token):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    SELECT token FROM active_sessions
                    WHERE token = %s AND expires_at > %s
                ''', (token, datetime.now()))
                row = cursor.fetchone()
                return row is not None
    except Exception:
        return False

def delete_session(token):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM active_sessions WHERE token = %s", (token,))

def add_login_history_entry(username, ip_address, country, region, city, status, user_agent):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO login_history (username, ip_address, country, region, city, status, user_agent)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            ''', (username, ip_address, country, region, city, status, user_agent))

def get_login_history(limit=100):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT id, timestamp, username, ip_address, country, region, city, status, user_agent
                FROM login_history
                ORDER BY timestamp DESC
                LIMIT %s
            ''', (limit,))
            rows = cursor.fetchall()
            for r in rows:
                if r['timestamp']:
                    if isinstance(r['timestamp'], datetime):
                        r['timestamp'] = r['timestamp'].isoformat()
                    else:
                        r['timestamp'] = str(r['timestamp'])
            return rows

# --- User Management Operations ---

def get_user_by_username(username: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, username, password_hash, full_name FROM users WHERE username = %s", (username,))
            return cursor.fetchone()

def get_user_by_token(token: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT u.id, u.username, u.full_name
                FROM users u
                JOIN active_sessions s ON u.id = s.user_id
                WHERE s.token = %s AND s.expires_at > %s
            ''', (token, datetime.now()))
            return cursor.fetchone()

def get_all_users():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, username, full_name, created_at FROM users ORDER BY username ASC")
            rows = cursor.fetchall()
            for r in rows:
                if r['created_at']:
                    if isinstance(r['created_at'], datetime):
                        r['created_at'] = r['created_at'].isoformat()
                    else:
                        r['created_at'] = str(r['created_at'])
            return rows

def create_user(username, password, full_name):
    pw_hash = hash_password(password)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO users (username, password_hash, full_name)
                VALUES (%s, %s, %s)
                RETURNING id
            ''', (username, pw_hash, full_name))
            return cursor.fetchone()['id']

def delete_user(user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Delete active sessions for this user first
            cursor.execute("DELETE FROM active_sessions WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))

def update_user_password(user_id, new_password):
    pw_hash = hash_password(new_password)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (pw_hash, user_id))
            # Invalidate all active sessions for this user to force re-login
            cursor.execute("DELETE FROM active_sessions WHERE user_id = %s", (user_id,))

def update_user_info(user_id, full_name):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET full_name = %s WHERE id = %s", (full_name, user_id))

def update_order_shipping_status(order_id: int, shipping_status: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE orders_cache SET shipping_status = %s WHERE order_id = %s", (shipping_status, order_id))

def create_manual_order(order_id: int, date_created: str, buyer_nickname: str, buyer_name: str, total_amount: float, status: str, shipping_status: str, items: list, source_platform: str, payment_method: str = None):
    import json
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO orders_cache 
                (order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform, payment_method)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                order_id,
                date_created,
                None,
                buyer_nickname,
                buyer_name,
                total_amount,
                'ARS',
                status,
                'approved',
                shipping_status,
                json.dumps(items),
                0,
                source_platform,
                payment_method
            ))
