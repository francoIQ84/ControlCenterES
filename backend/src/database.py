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
                    source_platform TEXT DEFAULT 'MERCADOLIBRE'
                )
            ''')

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
            cursor.execute('ALTER TABLE login_history ADD COLUMN IF NOT EXISTS username VARCHAR(100);')

            # Seed default admin user if no users exist
            cursor.execute("SELECT COUNT(*) as count FROM users")
            if cursor.fetchone()['count'] == 0:
                admin_pw_hash = hash_password("admin123")
                cursor.execute('''
                    INSERT INTO users (username, password_hash, full_name)
                    VALUES (%s, %s, %s)
                ''', ("admin", admin_pw_hash, "Administrador"))

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
                cursor.execute("SELECT cost_price, price_web, images, description, is_web_active FROM products_cache WHERE ml_id = %s", (p['ml_id'],))
                row = cursor.fetchone()
                cost_price = row['cost_price'] if row else 0.0
                price_web = row['price_web'] if row else 0.0
                images = row['images'] if row else ''
                description = row['description'] if row else ''
                is_web_active = row['is_web_active'] if row else 0

                cursor.execute('''
                    INSERT INTO products_cache 
                    (ml_id, title, price, available_quantity, cost_price, permalink, thumbnail, status, last_sync, price_web, images, description, is_web_active)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ml_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        price = EXCLUDED.price,
                        available_quantity = EXCLUDED.available_quantity,
                        permalink = EXCLUDED.permalink,
                        thumbnail = EXCLUDED.thumbnail,
                        status = EXCLUDED.status,
                        last_sync = EXCLUDED.last_sync
                ''', (p['ml_id'], p['title'], p['price'], p['available_quantity'], cost_price, 
                      p.get('permalink'), p.get('thumbnail'), p.get('status'), now, price_web, images, description, is_web_active))

def create_product(product_data):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO products_cache 
                (ml_id, title, price, available_quantity, cost_price, permalink, thumbnail, status, last_sync, price_web, images, description, is_web_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                product_data.get('is_web_active', 1)
            ))

def update_product_cost(ml_id, cost_price):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET cost_price = %s WHERE ml_id = %s", (cost_price, ml_id))

def update_product_stock_price(ml_id, quantity, price):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET available_quantity = %s, price = %s WHERE ml_id = %s", (quantity, price, ml_id))

def update_product_web_details(ml_id, price_web, images, description, is_web_active):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                UPDATE products_cache 
                SET price_web = %s, images = %s, description = %s, is_web_active = %s 
                WHERE ml_id = %s
            ''', (price_web, images, description, is_web_active, ml_id))

def get_all_products(query=None, status_filter=None, is_web_active=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            sql = "SELECT ml_id, title, price, available_quantity, cost_price, permalink, thumbnail, status, last_sync, price_web, images, description, is_web_active FROM products_cache WHERE 1=1"
            params = []
            
            if query:
                sql += " AND (title ILIKE %s OR ml_id ILIKE %s)"
                params.extend([f"%{query}%", f"%{query}%"])
                
            if status_filter:
                sql += " AND status = %s"
                params.append(status_filter)
                
            if is_web_active is not None:
                sql += " AND is_web_active = %s"
                params.append(is_web_active)
                
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
                    (order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (order_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        payment_status = EXCLUDED.payment_status,
                        shipping_status = EXCLUDED.shipping_status
                ''', (
                    o['order_id'], o['date_created'], o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
                    o['total_amount'], o['currency_id'], o['status'], o['payment_status'], o['shipping_status'],
                    json.dumps(o['items']), invoice_generated, source_platform
                ))
                
                cursor.execute('''
                    INSERT INTO customers 
                    (buyer_id, nickname, full_name, email, phone, document_type, document_number, source_platform)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (buyer_id) DO UPDATE SET
                        nickname = EXCLUDED.nickname,
                        full_name = EXCLUDED.full_name,
                        email = EXCLUDED.email,
                        phone = EXCLUDED.phone
                ''', (
                    o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
                    o['buyer'].get('email'), o['buyer'].get('phone'),
                    o['buyer'].get('document_type'), o['buyer'].get('document_number'),
                    o.get('source_platform', 'MERCADOLIBRE')
                ))

def update_order_invoice_status(order_id, status=1):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE orders_cache SET invoice_generated = %s WHERE order_id = %s", (status, order_id))

def get_all_orders(source_platform=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            if source_platform:
                cursor.execute("SELECT order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform FROM orders_cache WHERE source_platform = %s ORDER BY date_created DESC", (source_platform,))
            else:
                cursor.execute("SELECT order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform FROM orders_cache ORDER BY date_created DESC")
            rows = cursor.fetchall()
            
            orders = []
            for r in rows:
                orders.append({
                    'order_id': r['order_id'],
                    'date_created': r['date_created'],
                    'buyer': {
                        'id': r['buyer_id'],
                        'nickname': r['buyer_nickname'],
                        'name': r['buyer_name']
                    },
                    'total_amount': r['total_amount'],
                    'currency_id': r['currency_id'],
                    'status': r['status'],
                    'payment_status': r['payment_status'],
                    'shipping_status': r['shipping_status'],
                    'items': json.loads(r['items_json']),
                    'invoice_generated': bool(r['invoice_generated']),
                    'source_platform': r['source_platform']
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

def get_dashboard_metrics():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(order_id) as count, SUM(total_amount) as total FROM orders_cache WHERE status = 'paid'")
            sales_row = cursor.fetchone()
            total_sales = sales_row['count'] or 0
            total_revenue = sales_row['total'] or 0.0
            
            cursor.execute("SELECT COUNT(ml_id) as count FROM products_cache WHERE status = 'active'")
            total_active_products = cursor.fetchone()['count'] or 0
            
            cursor.execute("SELECT items_json FROM orders_cache WHERE status = 'paid'")
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
                    
            total_profit = total_revenue - total_cost
            profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0.0
            
            cursor.execute("SELECT COUNT(ml_id) as count FROM products_cache WHERE available_quantity <= 3 AND status = 'active'")
            low_stock_count = cursor.fetchone()['count'] or 0
            
            return {
                'total_sales': total_sales,
                'total_revenue': total_revenue,
                'total_active_products': total_active_products,
                'total_profit': total_profit,
                'profit_margin': profit_margin,
                'low_stock_count': low_stock_count
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
