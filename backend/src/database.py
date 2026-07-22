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
                    is_web_active INTEGER DEFAULT 0,
                    min_stock INTEGER DEFAULT 0
                )
            ''')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS visits_meli INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS visits_web INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS cost_meli REAL DEFAULT 0.0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS last_modified TEXT;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS prev_stock INTEGER;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS prev_price REAL;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS prev_cost_price REAL;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS prev_cost_meli REAL;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS prev_price_web REAL;')

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
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS meli_invoice_attached INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS shipping_msg_sent INTEGER DEFAULT 0;')

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
            cursor.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT;')
            cursor.execute("UPDATE users SET permissions = 'dashboard,inventory,sales,billing,expenses,customers,media,settings' WHERE permissions IS NULL;")

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
                    month INT,
                    year INT,
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
            
            # WhatsApp chat history table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS whatsapp_chat_history (
                    id SERIAL PRIMARY KEY,
                    sender TEXT NOT NULL,
                    message TEXT NOT NULL,
                    reply TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # WhatsApp product inquiries table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS whatsapp_product_inquiries (
                    id SERIAL PRIMARY KEY,
                    sender TEXT NOT NULL,
                    product_name TEXT NOT NULL,
                    in_stock BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            cursor.execute('ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS month INT;')
            cursor.execute('ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS year INT;')
            cursor.execute('ALTER TABLE login_history ADD COLUMN IF NOT EXISTS username VARCHAR(100);')
            cursor.execute('ALTER TABLE whatsapp_chat_history ADD COLUMN IF NOT EXISTS prompt_tokens INT DEFAULT 0;')
            cursor.execute('ALTER TABLE whatsapp_chat_history ADD COLUMN IF NOT EXISTS reply_tokens INT DEFAULT 0;')
            cursor.execute('ALTER TABLE whatsapp_chat_history ADD COLUMN IF NOT EXISTS total_tokens INT DEFAULT 0;')

            # Seed default admin user if no users exist
            cursor.execute("SELECT COUNT(*) as count FROM users")
            if cursor.fetchone()['count'] == 0:
                admin_pw_hash = hash_password("admin123")
                cursor.execute('''
                    INSERT INTO users (username, password_hash, full_name, permissions)
                    VALUES (%s, %s, %s, %s)
                ''', ("admin", admin_pw_hash, "Administrador", "dashboard,inventory,sales,billing,expenses,customers,media,settings"))

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
                cursor.execute("SELECT cost_price, cost_meli, price_web, images, description, is_web_active, visits_web FROM products_cache WHERE ml_id = %s", (p['ml_id'],))
                row = cursor.fetchone()
                cost_price = row['cost_price'] if row else 0.0
                cost_meli = row['cost_meli'] if row else 0.0
                price_web = row['price_web'] if row else 0.0
                images = row['images'] if (row and row['images']) else p.get('images', '')
                description = row['description'] if row else ''
                is_web_active = row['is_web_active'] if row else 0
                visits_web = row['visits_web'] if row else p.get('visits_web', 0)
                
                visits_meli = p.get('visits_meli', 0)

                cursor.execute('''
                    INSERT INTO products_cache 
                    (ml_id, title, price, available_quantity, cost_price, cost_meli, permalink, thumbnail, status, last_sync, price_web, images, description, is_web_active, visits_meli, visits_web)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                ''', (p['ml_id'], p['title'], p['price'], p['available_quantity'], cost_price, cost_meli, 
                      p.get('permalink'), p.get('thumbnail'), p.get('status'), now, price_web, images, description, is_web_active, visits_meli, visits_web))

def create_product(product_data):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO products_cache 
                (ml_id, title, price, available_quantity, cost_price, cost_meli, permalink, thumbnail, status, last_sync, price_web, images, description, is_web_active, visits_meli, visits_web, category_id, sync_meli, min_stock, last_modified)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                product_data['ml_id'],
                product_data['title'],
                product_data['price'],
                product_data['available_quantity'],
                product_data.get('cost_price', 0.0),
                product_data.get('cost_meli', 0.0),
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
                product_data.get('sync_meli', 1),
                product_data.get('min_stock', 0),
                now
            ))

def update_product_cost(ml_id, cost_price, cost_meli):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT cost_price, cost_meli, prev_cost_price, prev_cost_meli FROM products_cache WHERE ml_id = %s", (ml_id,))
            row = cursor.fetchone()
            p_cost = row['prev_cost_price'] if row else None
            p_meli = row['prev_cost_meli'] if row else None
            if row:
                if float(cost_price) != float(row['cost_price'] or 0.0):
                    p_cost = row['cost_price']
                if float(cost_meli) != float(row['cost_meli'] or 0.0):
                    p_meli = row['cost_meli']
            cursor.execute("UPDATE products_cache SET cost_price = %s, cost_meli = %s, prev_cost_price = %s, prev_cost_meli = %s, last_modified = %s WHERE ml_id = %s", (cost_price, cost_meli, p_cost, p_meli, now, ml_id))

def update_product_stock_price(ml_id, quantity, price):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT available_quantity, price, prev_stock, prev_price FROM products_cache WHERE ml_id = %s", (ml_id,))
            row = cursor.fetchone()
            p_stock = row['prev_stock'] if row else None
            p_price = row['prev_price'] if row else None
            if row:
                if int(quantity) != int(row['available_quantity'] or 0):
                    p_stock = row['available_quantity']
                if float(price) != float(row['price'] or 0.0):
                    p_price = row['price']
            cursor.execute("UPDATE products_cache SET available_quantity = %s, price = %s, prev_stock = %s, prev_price = %s, last_modified = %s WHERE ml_id = %s", (quantity, price, p_stock, p_price, now, ml_id))

def update_product_web_details(ml_id, price_web, images, description, is_web_active, category_id=None, sync_meli=1, min_stock=0):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT price_web, prev_price_web FROM products_cache WHERE ml_id = %s", (ml_id,))
            row = cursor.fetchone()
            p_web = row['prev_price_web'] if row else None
            if row:
                if float(price_web) != float(row['price_web'] or 0.0):
                    p_web = row['price_web']
            cursor.execute('''
                UPDATE products_cache 
                SET price_web = %s, images = %s, description = %s, is_web_active = %s, category_id = %s, sync_meli = %s, min_stock = %s, prev_price_web = %s, last_modified = %s
                WHERE ml_id = %s
            ''', (price_web, images, description, is_web_active, category_id, sync_meli, min_stock, p_web, now, ml_id))

def get_all_products(query=None, status_filter=None, is_web_active=None, category_slug=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            sql = """
                SELECT p.ml_id, p.title, p.price, p.available_quantity, p.cost_price, p.cost_meli, p.permalink, p.thumbnail, 
                       p.status, p.last_sync, p.price_web, p.images, p.description, p.is_web_active, 
                       p.visits_meli, p.visits_web, p.category_id, p.sync_meli, p.min_stock, p.last_modified,
                       p.prev_stock, p.prev_price, p.prev_cost_price, p.prev_cost_meli, p.prev_price_web,
                       c.name as category_name, c.slug as category_slug
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

def get_product_by_ml_id(ml_id: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT p.ml_id, p.title, p.price, p.available_quantity, p.cost_price, p.cost_meli, p.permalink, p.thumbnail, 
                       p.status, p.last_sync, p.price_web, p.images, p.description, p.is_web_active, 
                       p.visits_meli, p.visits_web, p.category_id, p.sync_meli, p.min_stock, p.last_modified,
                       p.prev_stock, p.prev_price, p.prev_cost_price, p.prev_cost_meli, p.prev_price_web,
                       c.name as category_name, c.slug as category_slug
                 FROM products_cache p
                 LEFT JOIN categories c ON p.category_id = c.id
                 WHERE p.ml_id = %s
            """, (ml_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

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
                    (order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform, payment_method, meli_invoice_attached)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (order_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        payment_status = EXCLUDED.payment_status,
                        shipping_status = EXCLUDED.shipping_status,
                        payment_method = EXCLUDED.payment_method,
                        meli_invoice_attached = EXCLUDED.meli_invoice_attached
                ''', (
                    o['order_id'], o['date_created'], o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
                    o['total_amount'], o['currency_id'], o['status'], o['payment_status'], o['shipping_status'],
                    json.dumps(o['items']), invoice_generated, source_platform, o.get('payment_method'),
                    o.get('meli_invoice_attached', 0)
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
                       o.invoice_number, o.afip_cae, o.afip_cae_exp, o.meli_invoice_attached, c.document_type, c.document_number, c.address 
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
                'afip_cae_exp': r.get('afip_cae_exp', ''),
                'meli_invoice_attached': bool(r.get('meli_invoice_attached', 0))
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
                           o.invoice_number, o.afip_cae, o.afip_cae_exp, o.meli_invoice_attached, c.document_type, c.document_number, c.address
                    FROM orders_cache o
                    LEFT JOIN customers c ON o.buyer_id = c.buyer_id
                    WHERE o.source_platform = %s 
                    ORDER BY o.date_created DESC
                """, (source_platform,))
            else:
                cursor.execute("""
                    SELECT o.order_id, o.date_created, o.buyer_id, o.buyer_nickname, o.buyer_name, o.total_amount, o.currency_id, o.status, 
                           o.payment_status, o.shipping_status, o.items_json, o.invoice_generated, o.source_platform, o.payment_method,
                           o.invoice_number, o.afip_cae, o.afip_cae_exp, o.meli_invoice_attached, c.document_type, c.document_number, c.address
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
                    'afip_cae_exp': r.get('afip_cae_exp', ''),
                    'meli_invoice_attached': bool(r.get('meli_invoice_attached', 0))
                })
            return orders

def get_all_customers():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT 
                    c.buyer_id, c.nickname, c.full_name, c.email, c.phone, c.document_type, c.document_number, c.address, c.source_platform,
                    COUNT(o.order_id) as total_orders,
                    COALESCE(SUM(o.total_amount), 0) as total_spent
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
                    'address': r.get('address', ''),
                    'total_orders': r['total_orders'] or 0,
                    'total_spent': r['total_spent'] or 0.0,
                    'source_platform': r['source_platform']
                })
            return customers

def create_customer(customer_data):
    import time
    with get_connection() as conn:
        with conn.cursor() as cursor:
            buyer_id = customer_data.get('buyer_id')
            if not buyer_id:
                buyer_id = int(time.time() * 1000)
            
            nickname = customer_data.get('nickname') or ''
            full_name = customer_data.get('full_name') or ''
            email = customer_data.get('email') or ''
            phone = customer_data.get('phone') or ''
            document_type = customer_data.get('document_type') or ''
            document_number = customer_data.get('document_number') or ''
            address = customer_data.get('address') or ''
            source_platform = customer_data.get('source_platform') or 'MANUAL'

            cursor.execute('''
                INSERT INTO customers (buyer_id, nickname, full_name, email, phone, document_type, document_number, address, source_platform)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING buyer_id
            ''', (buyer_id, nickname, full_name, email, phone, document_type, document_number, address, source_platform))
            row = cursor.fetchone()
            return row['buyer_id']

def update_customer(buyer_id, customer_data):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                UPDATE customers
                SET nickname = %s,
                    full_name = %s,
                    email = %s,
                    phone = %s,
                    document_type = %s,
                    document_number = %s,
                    address = %s
                WHERE buyer_id = %s
            ''', (
                customer_data.get('nickname', ''),
                customer_data.get('full_name', ''),
                customer_data.get('email', ''),
                customer_data.get('phone', ''),
                customer_data.get('document_type', ''),
                customer_data.get('document_number', ''),
                customer_data.get('address', ''),
                buyer_id
            ))
            return True

def delete_customer(buyer_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM customers WHERE buyer_id = %s", (buyer_id,))
            return True

# --- Metrics Operations ---

_ip_country_cache = {}
import time

def increment_product_web_visits(ml_id, domain=None, ip_address=None):
    country = "Desconocido"
    
    if ip_address and ip_address.startswith("::ffff:"):
        ip_address = ip_address.replace("::ffff:", "")
        
    is_local = False
    if not ip_address or ip_address in ("127.0.0.1", "localhost", "::1"):
        is_local = True
    elif ip_address.startswith("192.168.") or ip_address.startswith("10.") or ip_address.startswith("172."):
        is_local = True
        
    if not is_local:
        now = time.time()
        if ip_address in _ip_country_cache and (now - _ip_country_cache[ip_address][1]) < 86400:
            country = _ip_country_cache[ip_address][0]
        else:
            try:
                import requests
                res = requests.get(f"http://ip-api.com/json/{ip_address}", timeout=2.0)
                if res.status_code == 200:
                    data = res.json()
                    if data.get("status") == "success":
                        country = data.get("country", "Desconocido")
                        _ip_country_cache[ip_address] = (country, now)
                    elif data.get("status") == "fail" and data.get("message") == "private range":
                        _ip_country_cache[ip_address] = ("Desconocido", now)
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
            
            items_query = "SELECT items_json, source_platform FROM orders_cache WHERE status = 'paid'" + date_filter
            cursor.execute(items_query, tuple(params))
            orders_items = cursor.fetchall()
            
            cursor.execute("SELECT ml_id, cost_price, cost_meli FROM products_cache")
            costs = {r['ml_id']: (r['cost_price'], r['cost_meli']) for r in cursor.fetchall()}
            
            total_cost = 0.0
            for row in orders_items:
                source_platform = row.get('source_platform', 'MERCADOLIBRE')
                items = json.loads(row['items_json'])
                for item in items:
                    ml_id = item.get('id')
                    quantity = item.get('quantity', 1)
                    cost_base, cost_ml = costs.get(ml_id, (0.0, 0.0))
                    
                    if source_platform == 'MERCADOLIBRE':
                        cost = cost_base + cost_ml
                    else:
                        cost = cost_base
                        
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
            
            # Fixed expenses (now stored by month/year)
            fixed_query = "SELECT SUM(amount) as total FROM fixed_expenses"
            fixed_params = []
            
            if period in ["year", "month", "week", "day"]:
                now = datetime.now()
                fixed_query += " WHERE year = %s"
                fixed_params.append(now.year)
                
                if period in ["month", "week", "day"]:
                    fixed_query += " AND month = %s"
                    fixed_params.append(now.month)
            
            cursor.execute(fixed_query, tuple(fixed_params))
            fixed_row = cursor.fetchone()
            total_fixed_raw = fixed_row['total'] if fixed_row and fixed_row['total'] else 0.0
            
            total_fixed_expenses = total_fixed_raw
            if period == "day":
                total_fixed_expenses = total_fixed_raw / 30.0
            elif period == "week":
                total_fixed_expenses = total_fixed_raw / 4.333

            total_expenses = total_var_expenses + total_fixed_expenses
            
            # Net profit = Revenue - Product Costs - Expenses
            total_profit = total_revenue - total_cost - total_expenses
            profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0.0
            
            cursor.execute("SELECT COUNT(ml_id) as count FROM products_cache WHERE available_quantity <= CASE WHEN min_stock > 0 THEN min_stock ELSE 3 END AND status = 'active'")
            low_stock_count = cursor.fetchone()['count'] or 0
            
            cursor.execute("""
                SELECT ml_id, title, available_quantity, min_stock, status 
                FROM products_cache 
                WHERE available_quantity <= CASE WHEN min_stock > 0 THEN min_stock ELSE 3 END 
                AND status = 'active'
                ORDER BY available_quantity ASC LIMIT 10
            """)
            low_stock_products = [dict(r) for r in cursor.fetchall()]
            
            cursor.execute("SELECT SUM(visits_meli) as meli FROM products_cache")
            visits_row = cursor.fetchone()
            total_visits_meli = (visits_row['meli'] if visits_row else 0) or 0
            
            # (Rest of queries...)
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
                'low_stock_products': low_stock_products,
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
            cursor.execute("SELECT id, username, password_hash, full_name, permissions FROM users WHERE username = %s", (username,))
            return cursor.fetchone()

def get_user_by_token(token: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT u.id, u.username, u.full_name, u.permissions
                FROM users u
                JOIN active_sessions s ON u.id = s.user_id
                WHERE s.token = %s AND s.expires_at > %s
            ''', (token, datetime.now()))
            return cursor.fetchone()

def get_all_users():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, username, full_name, permissions, created_at FROM users ORDER BY username ASC")
            rows = cursor.fetchall()
            for r in rows:
                if r['created_at']:
                    if isinstance(r['created_at'], datetime):
                        r['created_at'] = r['created_at'].isoformat()
                    else:
                        r['created_at'] = str(r['created_at'])
            return rows

def create_user(username, password, full_name, permissions=None):
    if permissions is None:
        permissions = "dashboard,inventory,sales,billing,expenses,customers,media,settings"
    pw_hash = hash_password(password)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO users (username, password_hash, full_name, permissions)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            ''', (username, pw_hash, full_name, permissions))
            return cursor.fetchone()['id']

def update_user_permissions(user_id, permissions):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET permissions = %s WHERE id = %s", (permissions, user_id))

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

# --- WhatsApp Operations ---

def get_whatsapp_chat_history(sender: str, limit: int = 10):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    SELECT message, reply, timestamp 
                    FROM whatsapp_chat_history 
                    WHERE sender = %s 
                    ORDER BY timestamp DESC 
                    LIMIT %s
                ''', (sender, limit))
                history = cursor.fetchall()
                history.reverse()
                return history
    except Exception as e:
        print(f"[get_whatsapp_chat_history error] {e}")
        return []

def add_whatsapp_chat_message(sender: str, message: str, reply: str, prompt_tokens: int = 0, reply_tokens: int = 0, total_tokens: int = 0):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    INSERT INTO whatsapp_chat_history (sender, message, reply, prompt_tokens, reply_tokens, total_tokens)
                    VALUES (%s, %s, %s, %s, %s, %s)
                ''', (sender, message, reply, prompt_tokens, reply_tokens, total_tokens))
    except Exception as e:
        print(f"[add_whatsapp_chat_message error] {e}")

def add_whatsapp_inquiry(sender: str, product_name: str, in_stock: bool):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    INSERT INTO whatsapp_product_inquiries (sender, product_name, in_stock)
                    VALUES (%s, %s, %s)
                ''', (sender, product_name, in_stock))
    except Exception as e:
        print(f"[add_whatsapp_inquiry error] {e}")

def get_whatsapp_inquiries_summary():
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    SELECT 
                        INITCAP(LOWER(TRIM(product_name))) as product_name,
                        COUNT(*) as count,
                        SUM(CASE WHEN in_stock THEN 1 ELSE 0 END) as in_stock_count,
                        SUM(CASE WHEN NOT in_stock THEN 1 ELSE 0 END) as out_of_stock_count,
                        MAX(created_at) as last_inquired
                    FROM whatsapp_product_inquiries
                    GROUP BY INITCAP(LOWER(TRIM(product_name)))
                    ORDER BY count DESC
                    LIMIT 20
                ''')
                top_products = cursor.fetchall()

                cursor.execute('''
                    SELECT 
                        COUNT(*) as total_inquiries,
                        SUM(CASE WHEN in_stock THEN 1 ELSE 0 END) as total_in_stock,
                        SUM(CASE WHEN NOT in_stock THEN 1 ELSE 0 END) as total_out_of_stock
                    FROM whatsapp_product_inquiries
                ''')
                totals = cursor.fetchone() or {'total_inquiries': 0, 'total_in_stock': 0, 'total_out_of_stock': 0}

                return {
                    "total_inquiries": totals['total_inquiries'] or 0,
                    "total_in_stock": totals['total_in_stock'] or 0,
                    "total_out_of_stock": totals['total_out_of_stock'] or 0,
                    "top_products": top_products
                }
    except Exception as e:
        print(f"[get_whatsapp_inquiries_summary error] {e}")
        return {"total_inquiries": 0, "total_in_stock": 0, "total_out_of_stock": 0, "top_products": []}

def get_whatsapp_inquiries_list(limit: int = 50):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    SELECT id, sender, product_name, in_stock, created_at 
                    FROM whatsapp_product_inquiries 
                    ORDER BY created_at DESC 
                    LIMIT %s
                ''', (limit,))
                return cursor.fetchall()
    except Exception as e:
        print(f"[get_whatsapp_inquiries_list error] {e}")
        return []

def get_whatsapp_token_usage():
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('''
                    SELECT 
                        COUNT(*) as requests_today,
                        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens_today,
                        COALESCE(SUM(reply_tokens), 0) as reply_tokens_today,
                        COALESCE(SUM(total_tokens), 0) as total_tokens_today
                    FROM whatsapp_chat_history
                    WHERE DATE(timestamp) = CURRENT_DATE
                ''')
                today = cursor.fetchone() or {}

                cursor.execute('''
                    SELECT 
                        COUNT(*) as requests_month,
                        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens_month,
                        COALESCE(SUM(reply_tokens), 0) as reply_tokens_month,
                        COALESCE(SUM(total_tokens), 0) as total_tokens_month
                    FROM whatsapp_chat_history
                    WHERE DATE_TRUNC('month', timestamp) = DATE_TRUNC('month', CURRENT_DATE)
                ''')
                month = cursor.fetchone() or {}

                requests_today = int(today.get('requests_today') or 0)
                daily_limit = 1500
                quota_used_percent = min(100.0, round((requests_today / daily_limit) * 100, 1))

                prompt_today = int(today.get('prompt_tokens_today') or 0)
                reply_today = int(today.get('reply_tokens_today') or 0)
                prompt_month = int(month.get('prompt_tokens_month') or 0)
                reply_month = int(month.get('reply_tokens_month') or 0)

                # Estimated cost in USD if using paid tier ($0.075 / 1M input tokens, $0.30 / 1M output tokens)
                cost_today_usd = round((prompt_today * 0.000000075) + (reply_today * 0.0000003), 4)
                cost_month_usd = round((prompt_month * 0.000000075) + (reply_month * 0.0000003), 4)

                return {
                    "requests_today": requests_today,
                    "daily_limit_requests": daily_limit,
                    "quota_used_percent": quota_used_percent,
                    "prompt_tokens_today": prompt_today,
                    "reply_tokens_today": reply_today,
                    "total_tokens_today": int(today.get('total_tokens_today') or 0),
                    "requests_month": int(month.get('requests_month') or 0),
                    "total_tokens_month": int(month.get('total_tokens_month') or 0),
                    "cost_today_usd": cost_today_usd,
                    "cost_month_usd": cost_month_usd,
                    "free_tier_rpm_limit": 15,
                    "free_tier_tpm_limit": 1000000
                }
    except Exception as e:
        print(f"[get_whatsapp_token_usage error] {e}")
        return {
            "requests_today": 0, "daily_limit_requests": 1500, "quota_used_percent": 0.0,
            "prompt_tokens_today": 0, "reply_tokens_today": 0, "total_tokens_today": 0,
            "requests_month": 0, "total_tokens_month": 0,
            "free_tier_rpm_limit": 15, "free_tier_tpm_limit": 1000000
        }
