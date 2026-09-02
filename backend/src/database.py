import os
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import hashlib
import secrets
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

from src import tenancy

load_dotenv()

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/controlcenter')

def get_connection():
    """Returns a psycopg2 connection to the database, scoped to the active tenant.

    Every connection declares which tenant it belongs to via the
    `app.current_tenant` session variable. PostgreSQL's Row Level Security
    policies then filter every statement issued on it, which is what allows the
    existing hand-written SQL across the codebase to stay untouched: the
    segregation is enforced by the engine, not by each query.

    Outside a request (scheduler, maintenance scripts) the context defaults to
    the master tenant, preserving the original single-tenant behaviour.
    """
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    conn.autocommit = True
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT set_config('app.current_tenant', %s, false)",
                           (tenancy.get_current_tenant_id(),))
    except psycopg2.Error:
        # Migration 001 not applied yet: the setting is harmless to skip and the
        # system keeps running exactly as it did before multi-tenancy.
        pass
    return conn

def _can_run_ddl():
    """Whether the connected role is allowed to create/alter tables."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS ok")
                return bool(cursor.fetchone()['ok'])
    except psycopg2.Error:
        return False


def init_db():
    """Initializes the PostgreSQL database and creates the necessary tables if they don't exist.

    Under multi-tenancy the application connects with a least-privilege role
    (`controlcenter_app`) that deliberately cannot run DDL, since owning the
    tables would let it bypass its own RLS policies. In that setup the schema is
    owned by the migration runner instead, so bootstrapping is skipped rather
    than crashing the boot.

    Deployments still connecting as a superuser keep the original self-migrating
    behaviour untouched.
    """
    if not _can_run_ddl():
        print("[DB] El rol de conexión no tiene privilegios DDL: se omite el "
              "bootstrap de esquema. Las migraciones lo gestionan "
              "(python -m migrations.run_migration --apply).")
        return

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
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS is_hidden INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS manufacturing_time INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS shipping_cost_est REAL DEFAULT 0.0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS tax_rate_pct REAL DEFAULT 3.5;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS other_cost REAL DEFAULT 0.0;')

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
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS description_meli TEXT;')
            cursor.execute('ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS use_meli_description INTEGER DEFAULT 1;')

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
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS shipping_pickup_msg_sent INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS purchase_msg_sent INTEGER DEFAULT 0;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS mp_payment_id BIGINT;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS mp_fee_amount REAL DEFAULT 0.0;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS inventory_linked INTEGER DEFAULT 1;')
            cursor.execute('ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS cost_amount REAL DEFAULT 0.0;')
            cursor.execute('ALTER TABLE variable_expenses ADD COLUMN IF NOT EXISTS mp_payment_id BIGINT;')
            cursor.execute('ALTER TABLE variable_expenses ADD COLUMN IF NOT EXISTS is_auto_mp INTEGER DEFAULT 0;')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS deleted_mp_expenses (
                    mp_payment_id BIGINT PRIMARY KEY,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
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
            cursor.execute('ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;')
            cursor.execute('ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;')
            cursor.execute('ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP;')
            cursor.execute("UPDATE customers SET source_platform = 'MANUAL' WHERE source_platform IS NULL OR source_platform = '';")


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

            # Incomes table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS incomes (
                    id SERIAL PRIMARY KEY,
                    date DATE NOT NULL,
                    description VARCHAR(255) NOT NULL,
                    amount REAL NOT NULL,
                    category VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Service Payments / Vencimientos table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS service_payments (
                    id SERIAL PRIMARY KEY,
                    description VARCHAR(255) NOT NULL,
                    category VARCHAR(100),
                    amount REAL NOT NULL,
                    due_date DATE NOT NULL,
                    period_month INT NOT NULL,
                    period_year INT NOT NULL,
                    status VARCHAR(20) DEFAULT 'pending',
                    payment_link TEXT,
                    payment_code VARCHAR(100),
                    paid_date TIMESTAMP,
                    auto_recurring BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('ALTER TABLE service_payments ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMP;')
            
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

            # WhatsApp paused chats table (Human Takeover)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS whatsapp_paused_chats (
                    sender VARCHAR(64) PRIMARY KEY,
                    paused_until TIMESTAMP NOT NULL,
                    reason VARCHAR(255) DEFAULT 'human_takeover',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Blog posts table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS blog_posts (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    slug VARCHAR(255) NOT NULL UNIQUE,
                    category VARCHAR(100) DEFAULT 'General',
                    summary TEXT,
                    content TEXT NOT NULL,
                    cover_image TEXT,
                    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_published INT DEFAULT 1,
                    author VARCHAR(100) DEFAULT 'Equipo Hidroponia Rosario',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Leads table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS leads (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    country VARCHAR(100) DEFAULT 'Argentina',
                    source VARCHAR(100) DEFAULT 'popup_lead',
                    pdf_sent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('ALTER TABLE leads ADD COLUMN IF NOT EXISTS name VARCHAR(255);')
            cursor.execute('ALTER TABLE leads ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT \'Argentina\';')
            cursor.execute('ALTER TABLE leads ADD COLUMN IF NOT EXISTS pdf_sent TEXT;')

            # Monitored trademarks table (INPI)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS monitored_trademarks (
                    id SERIAL PRIMARY KEY,
                    acta VARCHAR(50) UNIQUE NOT NULL,
                    denominacion VARCHAR(255) NOT NULL,
                    clase INTEGER,
                    tipo_marca VARCHAR(100),
                    titulares TEXT,
                    numero_resolucion VARCHAR(50),
                    estado VARCHAR(100),
                    fecha_ingreso TEXT,
                    fecha_concesion_estimada VARCHAR(50),
                    fecha_vencimiento_10anos VARCHAR(50),
                    requiere_djumt BOOLEAN DEFAULT FALSE,
                    djumt_codigo VARCHAR(50),
                    djumt_mensaje TEXT,
                    image_url TEXT,
                    notes TEXT,
                    last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Marketing posts table
            # This table was being INSERTed into by create_marketing_post() without
            # ever being created here, so it only existed where it had been added by
            # hand. Declaring it keeps every environment on the same schema.
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS marketing_posts (
                    id SERIAL PRIMARY KEY,
                    product_ml_id TEXT,
                    title VARCHAR(255) DEFAULT 'Publicación',
                    post_type VARCHAR(50) DEFAULT 'post',
                    platforms VARCHAR(255) DEFAULT 'instagram,facebook',
                    caption TEXT,
                    media_urls TEXT,
                    scheduled_at TIMESTAMP,
                    status VARCHAR(50) DEFAULT 'draft',
                    external_post_id TEXT,
                    published_at TEXT,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Diffusion groups table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS diffusion_groups (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    channel_type VARCHAR(50) DEFAULT 'both',
                    criteria_json TEXT DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Diffusion group members table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS diffusion_group_members (
                    id SERIAL PRIMARY KEY,
                    group_id INTEGER REFERENCES diffusion_groups(id) ON DELETE CASCADE,
                    customer_id BIGINT,
                    contact_name VARCHAR(255),
                    phone VARCHAR(100),
                    email VARCHAR(255),
                    source VARCHAR(50) DEFAULT 'MANUAL',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Diffusion campaigns table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS diffusion_campaigns (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
                    group_id INTEGER REFERENCES diffusion_groups(id) ON DELETE SET NULL,
                    post_id INTEGER,
                    message_text TEXT,
                    media_url TEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    total_targets INTEGER DEFAULT 0,
                    sent_count INTEGER DEFAULT 0,
                    failed_count INTEGER DEFAULT 0,
                    logs_json TEXT DEFAULT '[]',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP
                )
            ''')

            # Mercado Libre AI Questions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS meli_questions (
                    id SERIAL PRIMARY KEY,
                    question_id VARCHAR(100) UNIQUE NOT NULL,
                    item_id VARCHAR(100) NOT NULL,
                    item_title TEXT,
                    buyer_id VARCHAR(100),
                    buyer_nickname VARCHAR(150),
                    question_text TEXT NOT NULL,
                    answer_text TEXT,
                    ai_model_used VARCHAR(100) DEFAULT 'gemini-3.6-flash',
                    status VARCHAR(50) DEFAULT 'ANSWERED_AUTO',
                    auto_replied BOOLEAN DEFAULT TRUE,
                    response_time_ms INTEGER DEFAULT 0,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    answered_at TIMESTAMP
                )
            ''')

            cursor.execute('ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS month INT;')
            cursor.execute('ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS year INT;')
            cursor.execute('ALTER TABLE login_history ADD COLUMN IF NOT EXISTS username VARCHAR(100);')
            cursor.execute('ALTER TABLE whatsapp_chat_history ADD COLUMN IF NOT EXISTS prompt_tokens INT DEFAULT 0;')
            cursor.execute('ALTER TABLE whatsapp_chat_history ADD COLUMN IF NOT EXISTS reply_tokens INT DEFAULT 0;')
            cursor.execute('ALTER TABLE whatsapp_chat_history ADD COLUMN IF NOT EXISTS total_tokens INT DEFAULT 0;')

            # Subscriptions & Billing Columns in tenants table
            cursor.execute('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_email VARCHAR(255);')
            cursor.execute('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_phone VARCHAR(50);')
            cursor.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';")
            cursor.execute('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_price REAL DEFAULT 0.0;')
            cursor.execute('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_billing_date DATE;')
            cursor.execute('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP;')

            # Subscriptions Payments history table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tenant_subscription_payments (
                    id SERIAL PRIMARY KEY,
                    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    mp_payment_id VARCHAR(100),
                    amount REAL NOT NULL,
                    currency VARCHAR(10) DEFAULT 'ARS',
                    billing_cycle VARCHAR(20) DEFAULT 'monthly',
                    period_start DATE,
                    period_end DATE,
                    status VARCHAR(50) DEFAULT 'approved',
                    payment_method VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_tenant_sub_payments_tenant ON tenant_subscription_payments(tenant_id);')

            # Auto-migrate existing users to have 'inpi' permission if they are admins
            try:
                cursor.execute("UPDATE users SET permissions = permissions || ',inpi' WHERE permissions NOT LIKE '%inpi%' AND (permissions LIKE '%settings%' OR permissions LIKE '%dashboard%');")
            except Exception:
                pass

            # Auto-migrate existing users to have 'marketing' and 'blog' permissions
            try:
                cursor.execute("UPDATE users SET permissions = permissions || ',marketing' WHERE permissions NOT LIKE '%marketing%' AND (permissions LIKE '%settings%' OR permissions LIKE '%dashboard%');")
                cursor.execute("UPDATE users SET permissions = permissions || ',blog' WHERE permissions NOT LIKE '%blog%' AND (permissions LIKE '%settings%' OR permissions LIKE '%dashboard%');")
            except Exception:
                pass

            # Seed default admin user if no users exist
            cursor.execute("SELECT COUNT(*) as count FROM users")
            if cursor.fetchone()['count'] == 0:
                admin_pw_hash = hash_password("admin123")
                cursor.execute('''
                    INSERT INTO users (username, password_hash, full_name, permissions)
                    VALUES (%s, %s, %s, %s)
                ''', ("admin", admin_pw_hash, "Administrador", "dashboard,inventory,sales,billing,expenses,customers,media,settings,inpi,marketing,blog"))

# --- Categories Operations ---

def get_all_categories():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, name, slug FROM categories ORDER BY name ASC")
            return cursor.fetchall()

def create_category(name: str, slug: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO categories (name, slug) VALUES (%s, %s) ON CONFLICT (tenant_id, name) DO UPDATE SET slug = EXCLUDED.slug RETURNING id", (name, slug))
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
                ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
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
                cursor.execute("SELECT cost_price, cost_meli, price_web, images, description, description_meli, use_meli_description, is_web_active, visits_web FROM products_cache WHERE ml_id = %s", (p['ml_id'],))
                row = cursor.fetchone()
                cost_price = row['cost_price'] if row else 0.0
                cost_meli = p.get('cost_meli') if (p.get('cost_meli') is not None and p.get('cost_meli') > 0) else (row['cost_meli'] if row else 0.0)
                price_web = row['price_web'] if row else 0.0
                images = row['images'] if (row and row['images']) else p.get('images', '')
                description = row['description'] if row else ''
                description_meli = p.get('description_meli') if p.get('description_meli') is not None else (row['description_meli'] if (row and row.get('description_meli')) else '')
                use_meli_description = p.get('use_meli_description') if p.get('use_meli_description') is not None else (row['use_meli_description'] if (row and row.get('use_meli_description') is not None) else 1)
                is_web_active = row['is_web_active'] if row else 0
                visits_web = row['visits_web'] if row else p.get('visits_web', 0)
                
                visits_meli = p.get('visits_meli', 0)

                cursor.execute('''
                    INSERT INTO products_cache 
                    (ml_id, title, price, available_quantity, cost_price, cost_meli, permalink, thumbnail, status, last_sync, price_web, images, description, description_meli, use_meli_description, is_web_active, visits_meli, visits_web)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (tenant_id, ml_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        price = CASE WHEN COALESCE(products_cache.sync_meli, 1) = 1 THEN EXCLUDED.price ELSE products_cache.price END,
                        available_quantity = CASE WHEN COALESCE(products_cache.sync_meli, 1) = 1 THEN EXCLUDED.available_quantity ELSE products_cache.available_quantity END,
                        prev_stock = CASE WHEN COALESCE(products_cache.sync_meli, 1) = 1 AND products_cache.available_quantity != EXCLUDED.available_quantity THEN products_cache.available_quantity ELSE products_cache.prev_stock END,
                        prev_price = CASE WHEN COALESCE(products_cache.sync_meli, 1) = 1 AND products_cache.price != EXCLUDED.price THEN products_cache.price ELSE products_cache.prev_price END,
                        cost_meli = CASE WHEN EXCLUDED.cost_meli > 0 THEN EXCLUDED.cost_meli ELSE products_cache.cost_meli END,
                        prev_cost_meli = CASE WHEN EXCLUDED.cost_meli > 0 AND products_cache.cost_meli != EXCLUDED.cost_meli THEN products_cache.cost_meli ELSE products_cache.prev_cost_meli END,
                        permalink = EXCLUDED.permalink,
                        thumbnail = EXCLUDED.thumbnail,
                        status = CASE WHEN COALESCE(products_cache.sync_meli, 1) = 1 THEN EXCLUDED.status ELSE products_cache.status END,
                        last_sync = EXCLUDED.last_sync,
                        visits_meli = EXCLUDED.visits_meli,
                        images = CASE WHEN products_cache.images IS NULL OR products_cache.images = '' THEN EXCLUDED.images ELSE products_cache.images END,
                        description_meli = CASE WHEN EXCLUDED.description_meli IS NOT NULL AND EXCLUDED.description_meli != '' THEN EXCLUDED.description_meli ELSE products_cache.description_meli END
                ''', (p['ml_id'], p['title'], p['price'], p['available_quantity'], cost_price, cost_meli, 
                      p.get('permalink'), p.get('thumbnail'), p.get('status'), now, price_web, images, description, description_meli, use_meli_description, is_web_active, visits_meli, visits_web))

def get_product_by_id(ml_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM products_cache WHERE ml_id = %s", (ml_id,))
            return cursor.fetchone()

def create_product(product_data):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO products_cache 
                (ml_id, title, price, available_quantity, cost_price, cost_meli, permalink, thumbnail, status, last_sync, price_web, images, description, description_meli, use_meli_description, is_web_active, visits_meli, visits_web, category_id, sync_meli, min_stock, featured_order, last_modified)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                product_data.get('description_meli', ''),
                product_data.get('use_meli_description', 1),
                product_data.get('is_web_active', 1),
                product_data.get('visits_meli', 0),
                product_data.get('visits_web', 0),
                product_data.get('category_id'),
                product_data.get('sync_meli', 1),
                product_data.get('min_stock', 0),
                product_data.get('featured_order', 0),
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

def update_product_web_details(ml_id, price_web, images, description, is_web_active, category_id=None, sync_meli=1, min_stock=0, featured_order=0, use_meli_description=1, description_meli=None):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT price_web, prev_price_web FROM products_cache WHERE ml_id = %s", (ml_id,))
            row = cursor.fetchone()
            p_web = row['prev_price_web'] if row else None
            if row:
                if float(price_web) != float(row['price_web'] or 0.0):
                    p_web = row['price_web']
            if description_meli is not None:
                cursor.execute('''
                    UPDATE products_cache 
                    SET price_web = %s, images = %s, description = %s, is_web_active = %s, category_id = %s, sync_meli = %s, min_stock = %s, featured_order = %s, use_meli_description = %s, description_meli = %s, prev_price_web = %s, last_modified = %s
                    WHERE ml_id = %s
                ''', (price_web, images, description, is_web_active, category_id, sync_meli, min_stock, featured_order, use_meli_description, description_meli, p_web, now, ml_id))
            else:
                cursor.execute('''
                    UPDATE products_cache 
                    SET price_web = %s, images = %s, description = %s, is_web_active = %s, category_id = %s, sync_meli = %s, min_stock = %s, featured_order = %s, use_meli_description = %s, prev_price_web = %s, last_modified = %s
                    WHERE ml_id = %s
                ''', (price_web, images, description, is_web_active, category_id, sync_meli, min_stock, featured_order, use_meli_description, p_web, now, ml_id))

def update_product_description_meli(ml_id: str, description_meli: str):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET description_meli = %s, last_modified = %s WHERE ml_id = %s", (description_meli, now, ml_id))

def update_featured_products_order(featured_ids: list):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Reset featured_order to 0 for all products
            cursor.execute("UPDATE products_cache SET featured_order = 0, last_modified = %s", (now,))
            # Set sequential order for products in the featured list
            for idx, ml_id in enumerate(featured_ids, start=1):
                cursor.execute("UPDATE products_cache SET featured_order = %s, last_modified = %s WHERE ml_id = %s", (idx, now, ml_id))

def update_product_hidden_status(ml_id: str, is_hidden: int):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET is_hidden = %s, last_modified = %s WHERE ml_id = %s", (int(is_hidden), now, ml_id))

def bulk_update_hidden_status(ml_ids: list, is_hidden: int):
    if not ml_ids:
        return
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            format_strings = ','.join(['%s'] * len(ml_ids))
            cursor.execute(f"UPDATE products_cache SET is_hidden = %s, last_modified = %s WHERE ml_id IN ({format_strings})", [int(is_hidden), now] + list(ml_ids))

def update_product_manufacturing_time(ml_id: str, days: int):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE products_cache SET manufacturing_time = %s, last_modified = %s WHERE ml_id = %s", (int(days), now, ml_id))

def bulk_update_manufacturing_time(ml_ids: list, days: int):
    if not ml_ids:
        return
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            format_strings = ','.join(['%s'] * len(ml_ids))
            cursor.execute(f"UPDATE products_cache SET manufacturing_time = %s, last_modified = %s WHERE ml_id IN ({format_strings})", [int(days), now] + list(ml_ids))

def bulk_update_web_active_status(ml_ids: list, is_web_active: int):
    if not ml_ids:
        return
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            format_strings = ','.join(['%s'] * len(ml_ids))
            cursor.execute(f"UPDATE products_cache SET is_web_active = %s, last_modified = %s WHERE ml_id IN ({format_strings})", [int(is_web_active), now] + list(ml_ids))

def bulk_update_category(ml_ids: list, category_id):
    if not ml_ids:
        return
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            format_strings = ','.join(['%s'] * len(ml_ids))
            cat_val = int(category_id) if category_id is not None and str(category_id) != "" and int(category_id) > 0 else None
            cursor.execute(f"UPDATE products_cache SET category_id = %s, last_modified = %s WHERE ml_id IN ({format_strings})", [cat_val, now] + list(ml_ids))

def bulk_update_sync_meli(ml_ids: list, sync_meli: int):
    if not ml_ids:
        return
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            format_strings = ','.join(['%s'] * len(ml_ids))
            cursor.execute(f"UPDATE products_cache SET sync_meli = %s, last_modified = %s WHERE ml_id IN ({format_strings})", [int(sync_meli), now] + list(ml_ids))

def bulk_adjust_prices(ml_ids: list, target: str, adjustment_type: str, value: float):
    if not ml_ids:
        return
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for ml_id in ml_ids:
                cursor.execute("SELECT price, price_web, prev_price, prev_price_web FROM products_cache WHERE ml_id = %s", (ml_id,))
                row = cursor.fetchone()
                if not row:
                    continue
                
                curr_price = float(row.get('price') or 0.0)
                curr_price_web = float(row.get('price_web') or 0.0)

                new_price = curr_price
                new_price_web = curr_price_web

                if target in ('meli', 'both'):
                    if adjustment_type == 'percentage':
                        new_price = round(curr_price * (1.0 + value / 100.0), 2)
                    else:
                        new_price = round(max(0.0, curr_price + value), 2)

                if target in ('web', 'both'):
                    if adjustment_type == 'percentage':
                        new_price_web = round(curr_price_web * (1.0 + value / 100.0), 2)
                    else:
                        new_price_web = round(max(0.0, curr_price_web + value), 2)

                cursor.execute('''
                    UPDATE products_cache 
                    SET price = %s, price_web = %s, prev_price = %s, prev_price_web = %s, last_modified = %s 
                    WHERE ml_id = %s
                ''', (new_price, new_price_web, curr_price, curr_price_web, now, ml_id))


def get_all_products(query=None, status_filter=None, is_web_active=None, category_slug=None, include_hidden=False, is_hidden=None, out_of_stock_30d=False, out_of_stock_days=None):
    if out_of_stock_days is None and out_of_stock_30d:
        out_of_stock_days = 30

    with get_connection() as conn:
        with conn.cursor() as cursor:
            sql = """
                SELECT p.ml_id, p.title, p.price, p.available_quantity, p.cost_price, p.cost_meli, p.permalink, p.thumbnail, 
                       p.status, p.last_sync, p.price_web, p.images, p.description, p.is_web_active, 
                       p.visits_meli, p.visits_web, p.category_id, p.sync_meli, p.min_stock, p.featured_order, p.last_modified,
                       p.prev_stock, p.prev_price, p.prev_cost_price, p.prev_cost_meli, p.prev_price_web, COALESCE(p.is_hidden, 0) as is_hidden,
                       COALESCE(p.manufacturing_time, 0) as manufacturing_time, p.description_meli, COALESCE(p.use_meli_description, 1) as use_meli_description,
                       c.name as category_name, c.slug as category_slug
                 FROM products_cache p
                 LEFT JOIN categories c ON p.category_id = c.id
                 WHERE 1=1
             """
            params = []
            
            if is_hidden is not None:
                sql += " AND COALESCE(p.is_hidden, 0) = %s"
                params.append(int(is_hidden))
            elif not include_hidden:
                sql += " AND COALESCE(p.is_hidden, 0) = 0"

            if out_of_stock_days and int(out_of_stock_days) > 0:
                cutoff_date = (datetime.now() - timedelta(days=int(out_of_stock_days))).strftime('%Y-%m-%d')
                sql += """ AND COALESCE(p.available_quantity, 0) <= 0 
                           AND (
                               COALESCE(p.prev_stock, 0) > 0 
                               OR (p.last_modified IS NOT NULL AND p.last_modified >= %s)
                               OR EXISTS (
                                   SELECT 1 FROM orders_cache o 
                                   WHERE o.items_json ILIKE ('%' || p.ml_id || '%') 
                                     AND o.date_created >= %s
                               )
                           )"""
                params.extend([cutoff_date, cutoff_date])

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
                
            sql += " ORDER BY CASE WHEN p.featured_order > 0 THEN p.featured_order ELSE 999999 END ASC, p.title ASC"

            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

def get_product_by_ml_id(ml_id: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT p.ml_id, p.title, p.price, p.available_quantity, p.cost_price, p.cost_meli, p.permalink, p.thumbnail, 
                       p.status, p.last_sync, p.price_web, p.images, p.description, p.is_web_active, 
                       p.visits_meli, p.visits_web, p.category_id, p.sync_meli, p.min_stock, p.featured_order, p.last_modified,
                       p.prev_stock, p.prev_price, p.prev_cost_price, p.prev_cost_meli, p.prev_price_web, COALESCE(p.is_hidden, 0) as is_hidden,
                       COALESCE(p.manufacturing_time, 0) as manufacturing_time, p.description_meli, COALESCE(p.use_meli_description, 1) as use_meli_description,
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
                    (order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated, source_platform, payment_method, meli_invoice_attached, mp_payment_id, mp_fee_amount, inventory_linked, cost_amount)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (tenant_id, order_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        payment_status = EXCLUDED.payment_status,
                        shipping_status = EXCLUDED.shipping_status,
                        payment_method = EXCLUDED.payment_method,
                        meli_invoice_attached = EXCLUDED.meli_invoice_attached,
                        mp_payment_id = COALESCE(EXCLUDED.mp_payment_id, orders_cache.mp_payment_id),
                        mp_fee_amount = CASE WHEN EXCLUDED.mp_fee_amount > 0 THEN EXCLUDED.mp_fee_amount ELSE orders_cache.mp_fee_amount END,
                        inventory_linked = CASE WHEN orders_cache.inventory_linked = 1 THEN 1 ELSE EXCLUDED.inventory_linked END,
                        cost_amount = CASE WHEN EXCLUDED.cost_amount > 0 THEN EXCLUDED.cost_amount ELSE orders_cache.cost_amount END
                ''', (
                    o['order_id'], o['date_created'], o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
                    o['total_amount'], o['currency_id'], o['status'], o['payment_status'], o['shipping_status'],
                    json.dumps(o['items']), invoice_generated, source_platform, o.get('payment_method'),
                    o.get('meli_invoice_attached', 0), o.get('mp_payment_id'), o.get('mp_fee_amount', 0.0),
                    o.get('inventory_linked', 1), o.get('cost_amount', 0.0)
                ))
                
                cursor.execute('''
                    INSERT INTO customers 
                    (buyer_id, nickname, full_name, email, phone, document_type, document_number, address, source_platform)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
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

def get_all_orders(source_platform=None, search=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            query = """
                SELECT o.order_id, o.date_created, o.buyer_id, o.buyer_nickname, o.buyer_name, o.total_amount, o.currency_id, o.status, 
                       o.payment_status, o.shipping_status, o.items_json, o.invoice_generated, o.source_platform, o.payment_method,
                       o.invoice_number, o.afip_cae, o.afip_cae_exp, o.meli_invoice_attached, c.document_type, c.document_number, c.address
                FROM orders_cache o
                LEFT JOIN customers c ON o.buyer_id = c.buyer_id
            """
            conditions = []
            params = []
            
            if source_platform:
                conditions.append("o.source_platform = %s")
                params.append(source_platform)
                
            if search and search.strip():
                pattern = f"%{search.strip()}%"
                conditions.append("""(
                    o.order_id ILIKE %s OR 
                    o.buyer_nickname ILIKE %s OR 
                    o.buyer_name ILIKE %s OR 
                    c.document_number ILIKE %s OR 
                    c.full_name ILIKE %s OR 
                    c.nickname ILIKE %s OR 
                    o.invoice_number ILIKE %s OR 
                    o.afip_cae ILIKE %s OR 
                    o.items_json ILIKE %s OR 
                    o.payment_method ILIKE %s OR
                    o.status ILIKE %s OR
                    o.shipping_status ILIKE %s
                )""")
                params.extend([pattern] * 12)
                
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
                
            query += " ORDER BY o.date_created DESC"
            cursor.execute(query, tuple(params))
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
                    c.buyer_id, c.nickname, c.full_name, c.email, c.phone, c.document_type, c.document_number, c.address, c.source_platform, c.created_at,
                    COUNT(o.order_id) as total_orders,
                    COALESCE(SUM(o.total_amount), 0) as total_spent,
                    MAX(o.date_created) as last_order_date
                FROM customers c
                LEFT JOIN orders_cache o
                       ON c.buyer_id = o.buyer_id AND c.tenant_id = o.tenant_id
                -- tenant_id va en el GROUP BY porque la clave primaria de
                -- customers pasó a ser (tenant_id, buyer_id): agrupar solo por
                -- buyer_id ya no le alcanza a PostgreSQL para deducir la
                -- dependencia funcional del resto de las columnas.
                GROUP BY c.tenant_id, c.buyer_id
                ORDER BY total_spent DESC, c.buyer_id DESC
            ''')
            rows = cursor.fetchall()
            
            customers = []
            for r in rows:
                created_str = r['created_at'].strftime('%Y-%m-%d %H:%M') if r.get('created_at') else None
                last_act = r.get('last_order_date') or created_str
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
                    'source_platform': r['source_platform'],
                    'created_at': created_str,
                    'last_activity': last_act
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

def delete_customers_bulk(buyer_ids):
    if not buyer_ids:
        return 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM customers WHERE buyer_id = ANY(%s)", (list(buyer_ids),))
            return cursor.rowcount


# --- Unified CRM & WhatsApp Extractor Operations ---

def sync_whatsapp_contacts_bulk(contacts_list):
    """Bulk inserts/updates WhatsApp contacts in the customers table."""
    import time
    synced_count = 0
    if not contacts_list:
        return 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for item in contacts_list:
                phone = (item.get('phone') or '').strip()
                if not phone:
                    continue
                name = (item.get('name') or '').strip() or f"Cliente WhatsApp +{phone}"
                
                # Check if phone already exists in customers
                cursor.execute("SELECT buyer_id, full_name, phone FROM customers WHERE phone = %s OR nickname = %s", (phone, phone))
                existing = cursor.fetchone()
                
                if existing:
                    cursor.execute("""
                        UPDATE customers 
                        SET full_name = CASE WHEN full_name IS NULL OR full_name = '' THEN %s ELSE full_name END,
                            nickname = CASE WHEN nickname IS NULL OR nickname = '' THEN %s ELSE nickname END
                        WHERE buyer_id = %s
                    """, (name, name, existing['buyer_id']))
                else:
                    new_buyer_id = int(time.time() * 1000) + synced_count
                    cursor.execute("""
                        INSERT INTO customers (buyer_id, nickname, full_name, phone, source_platform)
                        VALUES (%s, %s, %s, %s, 'WHATSAPP')
                        ON CONFLICT (tenant_id, buyer_id) DO NOTHING
                    """, (new_buyer_id, name, name, phone))
                synced_count += 1
    return synced_count

def sync_meta_leads_bulk(leads_list):
    """Inserta o actualiza prospectos/leads provenientes de Meta (Instagram Ads / Facebook Ads / Comentarios)."""
    import time
    synced_count = 0
    if not leads_list:
        return 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for item in leads_list:
                email = (item.get('email') or '').strip()
                phone = (item.get('phone') or '').strip()
                full_name = (item.get('full_name') or item.get('name') or '').strip() or "Lead Meta"
                source = (item.get('source_platform') or 'INSTAGRAM_ADS').upper()
                address = (item.get('address') or item.get('notes') or '').strip()
                username = item.get('username') or full_name
                
                if not email and not phone and not full_name:
                    continue

                existing = None
                if phone:
                    cursor.execute("SELECT buyer_id, full_name, email, phone FROM customers WHERE phone = %s", (phone,))
                    existing = cursor.fetchone()
                if not existing and email:
                    cursor.execute("SELECT buyer_id, full_name, email, phone FROM customers WHERE email = %s", (email,))
                    existing = cursor.fetchone()
                
                if existing:
                    cursor.execute("""
                        UPDATE customers 
                        SET full_name = CASE WHEN full_name IS NULL OR full_name = '' THEN %s ELSE full_name END,
                            email = CASE WHEN email IS NULL OR email = '' THEN %s ELSE email END,
                            phone = CASE WHEN phone IS NULL OR phone = '' THEN %s ELSE phone END,
                            address = CASE WHEN address IS NULL OR address = '' THEN %s ELSE address END,
                            source_platform = CASE WHEN source_platform IS NULL OR source_platform = '' OR source_platform = 'MANUAL' THEN %s ELSE source_platform END
                        WHERE buyer_id = %s
                    """, (full_name, email, phone, address, source, existing['buyer_id']))
                else:
                    new_buyer_id = int(time.time() * 1000) + synced_count
                    cursor.execute("""
                        INSERT INTO customers (buyer_id, nickname, full_name, email, phone, address, source_platform)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (tenant_id, buyer_id) DO NOTHING
                    """, (new_buyer_id, username, full_name, email, phone, address, source))
                synced_count += 1
    return synced_count

def get_product_inquiries_stats(limit=50):
    """Retrieves aggregated statistics for most consulted products in WhatsApp chats and web inquiries."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    wpi.product_name,
                    COUNT(wpi.id) as inquiry_count,
                    SUM(CASE WHEN wpi.in_stock THEN 1 ELSE 0 END) as in_stock_inquiries,
                    SUM(CASE WHEN NOT wpi.in_stock THEN 1 ELSE 0 END) as out_stock_inquiries,
                    COUNT(DISTINCT wpi.sender) as unique_customers,
                    MAX(wpi.created_at) as last_inquired_at,
                    p.ml_id,
                    p.title as catalog_title,
                    p.price_web,
                    p.price as price_meli,
                    p.available_quantity as stock,
                    p.thumbnail,
                    p.images
                FROM whatsapp_product_inquiries wpi
                LEFT JOIN products_cache p ON LOWER(p.title) LIKE LOWER('%%' || wpi.product_name || '%%')
                GROUP BY wpi.product_name, p.ml_id, p.title, p.price_web, p.price, p.available_quantity, p.thumbnail, p.images
                ORDER BY inquiry_count DESC, last_inquired_at DESC
                LIMIT %s
            """, (limit,))
            rows = cursor.fetchall()
            
            result = []
            for r in rows:
                result.append({
                    'product_name': r['product_name'],
                    'inquiry_count': r['inquiry_count'] or 0,
                    'in_stock_inquiries': r['in_stock_inquiries'] or 0,
                    'out_stock_inquiries': r['out_stock_inquiries'] or 0,
                    'unique_customers': r['unique_customers'] or 0,
                    'last_inquired_at': r['last_inquired_at'].strftime('%Y-%m-%d %H:%M') if r.get('last_inquired_at') else None,
                    'ml_id': r.get('ml_id'),
                    'catalog_title': r.get('catalog_title') or r['product_name'],
                    'price_web': r.get('price_web') or 0.0,
                    'price_meli': r.get('price_meli') or 0.0,
                    'stock': r.get('stock') if r.get('stock') is not None else 0,
                    'thumbnail': r.get('thumbnail') or ''
                })
            return result

def get_unified_crm_data():
    """Returns consolidated CRM statistics: Customers, WhatsApp contacts, Web Leads, Product Inquiries."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # 1. Customers with totals & dates
            customer_rows = get_all_customers()

            # 2. Leads / Web Subscribers
            cursor.execute("SELECT id, name, email, country, source, pdf_sent, created_at FROM leads ORDER BY created_at DESC")
            lead_rows = [dict(r) for r in cursor.fetchall()]
            for l in lead_rows:
                if l.get('created_at'):
                    l['created_at'] = l['created_at'].strftime('%Y-%m-%d %H:%M')

            # 3. WhatsApp unique contacts from chat history
            cursor.execute("""
                SELECT 
                    sender, 
                    COUNT(id) as total_messages, 
                    MAX(timestamp) as last_activity
                FROM whatsapp_chat_history
                GROUP BY sender
                ORDER BY last_activity DESC
            """)
            wa_rows = cursor.fetchall()
            wa_chats = []
            for w in wa_rows:
                wa_chats.append({
                    'sender': w['sender'],
                    'total_messages': w['total_messages'],
                    'last_activity': w['last_activity'].strftime('%Y-%m-%d %H:%M') if w.get('last_activity') else ''
                })

            # 4. Product inquiries stats
            product_inquiries = get_product_inquiries_stats(limit=50)

            # Metrics count
            total_customers = len(customer_rows)
            total_wa_chats = len(wa_chats)
            total_leads = len(lead_rows)
            total_inquiries = sum(p['inquiry_count'] for p in product_inquiries)

            return {
                'metrics': {
                    'total_customers': total_customers,
                    'total_wa_chats': total_wa_chats,
                    'total_leads': total_leads,
                    'total_inquiries': total_inquiries
                },
                'customers': customer_rows,
                'leads': lead_rows,
                'whatsapp_chats': wa_chats,
                'product_inquiries': product_inquiries
            }

def run_historical_whatsapp_chat_analysis():
    """Scans stored WhatsApp chat history and extracts product inquiries against the product catalog."""
    import re
    analyzed_count = 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Fetch active catalog product titles
            cursor.execute("SELECT ml_id, title, available_quantity FROM products_cache WHERE COALESCE(is_hidden, 0) = 0")
            products = cursor.fetchall()
            if not products:
                return 0

            # Fetch chat history messages
            cursor.execute("SELECT id, sender, message, timestamp FROM whatsapp_chat_history ORDER BY id ASC")
            messages = cursor.fetchall()

            for msg in messages:
                sender = msg['sender']
                text = (msg['message'] or '').lower().strip()
                if not text or len(text) < 3:
                    continue

                for p in products:
                    title = p['title'].lower()
                    # Check key terms (matching product title words)
                    words = [w for w in title.split() if len(w) > 3 and w not in ['para', 'con', 'de', 'del', 'los', 'las', 'por']]
                    if len(words) >= 2 and all(w in text for w in words[:2]):
                        in_stock = (p['available_quantity'] or 0) > 0
                        # Check if inquiry already recorded for this sender & product
                        cursor.execute("""
                            SELECT id FROM whatsapp_product_inquiries 
                            WHERE sender = %s AND product_name = %s
                        """, (sender, p['title']))
                        if not cursor.fetchone():
                            cursor.execute("""
                                INSERT INTO whatsapp_product_inquiries (sender, product_name, in_stock)
                                VALUES (%s, %s, %s)
                            """, (sender, p['title'], in_stock))
                            analyzed_count += 1
                        break

    return analyzed_count

def decrypt_whatsapp_db_and_parse(crypt_bytes: bytes, key_bytes: bytes):
    """Decrypts WhatsApp .crypt14 / .crypt15 / .crypt12 file with key and returns list of message dicts."""
    import tempfile
    import sqlite3
    import os
    import re
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    if len(key_bytes) >= 158:
        aes_key = key_bytes[126:158]
    elif len(key_bytes) == 32:
        aes_key = key_bytes
    elif len(key_bytes) == 64:
        aes_key = bytes.fromhex(key_bytes.decode('utf-8', errors='ignore').strip())
    else:
        aes_key = key_bytes[-32:] if len(key_bytes) >= 32 else key_bytes

    decrypted_bytes = None

    for iv_offset, cipher_offset in [(51, 67), (19, 67), (15, 67)]:
        try:
            iv = crypt_bytes[iv_offset:iv_offset+16]
            ciphertext_tag = crypt_bytes[cipher_offset:]
            aesgcm = AESGCM(aes_key)
            res = aesgcm.decrypt(iv, ciphertext_tag, None)
            if res and res.startswith(b'SQLite format 3'):
                decrypted_bytes = res
                break
        except Exception:
            pass

    if not decrypted_bytes or not decrypted_bytes.startswith(b'SQLite format 3'):
        try:
            iv = crypt_bytes[51:67]
            ciphertext = crypt_bytes[67:-16]
            cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            raw = decryptor.update(ciphertext) + decryptor.finalize()
            if raw.startswith(b'SQLite format 3'):
                decrypted_bytes = raw
        except Exception:
            pass

    if not decrypted_bytes or not decrypted_bytes.startswith(b'SQLite format 3'):
        raise ValueError("No se pudo desencriptar la base de datos de WhatsApp. Verifica que la clave corresponda al archivo msgstore.")

    with tempfile.NamedTemporaryFile(delete=False, suffix='.db') as tmp:
        tmp.write(decrypted_bytes)
        tmp_path = tmp.name

    messages_list = []
    try:
        conn = sqlite3.connect(tmp_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [r[0] for r in cursor.fetchall()]

        msg_table = 'messages' if 'messages' in tables else ('message' if 'message' in tables else None)
        if msg_table:
            # Check columns in msg_table
            cursor.execute(f"PRAGMA table_info({msg_table});")
            cols = [c[1] for c in cursor.fetchall()]
            text_col = 'text_data' if 'text_data' in cols else ('data' if 'data' in cols else None)

            if text_col:
                if 'jid' in tables:
                    cursor.execute(f"""
                        SELECT COALESCE(j.user, j.raw_string, m.key_remote_jid), m.{text_col}, m.timestamp
                        FROM {msg_table} m
                        LEFT JOIN jid j ON m.key_remote_jid = j.raw_string OR m.chat_row_id = j._id
                        WHERE m.{text_col} IS NOT NULL AND length(m.{text_col}) > 0
                    """)
                    for r in cursor.fetchall():
                        sender = r[0] or 'Cliente WhatsApp'
                        text = r[1] or ''
                        ts = r[2]
                        if text:
                            messages_list.append({'sender': str(sender), 'text': str(text), 'timestamp': ts})
                else:
                    cursor.execute(f"SELECT key_remote_jid, {text_col}, timestamp FROM {msg_table} WHERE {text_col} IS NOT NULL AND length({text_col}) > 0")
                    for r in cursor.fetchall():
                        messages_list.append({'sender': str(r[0] or ''), 'text': str(r[1] or ''), 'timestamp': r[2]})
        conn.close()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return messages_list

def import_whatsapp_chat_file(file_content_str: str, filename: str, key_bytes: bytes = None, raw_bytes: bytes = None):
    """Parses an exported WhatsApp chat file (.txt, .csv, .json, etc.) or decrypts .crypt14 with key file."""
    import re
    import time
    
    imported_messages = 0
    imported_contacts = 0
    contacts_map = {} # phone/name -> count

    with get_connection() as conn:
        with conn.cursor() as cursor:
            # If key_bytes provided, attempt decryption of raw_bytes (.crypt14 / .crypt15)
            if key_bytes and raw_bytes:
                decrypted_msgs = decrypt_whatsapp_db_and_parse(raw_bytes, key_bytes)
                for msg in decrypted_msgs:
                    sender = msg['sender']
                    text = msg['text']
                    clean_digits = re.sub(r'[^0-9]', '', sender)
                    sender_key = clean_digits if len(clean_digits) >= 10 else sender
                    
                    cursor.execute("""
                        INSERT INTO whatsapp_chat_history (sender, message, reply, timestamp)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                    """, (sender_key, text, '[Desencriptado desde Backup .crypt]'))
                    imported_messages += 1
                    
                    if sender_key not in contacts_map:
                        contacts_map[sender_key] = sender
    
    # Try filename extraction for default contact name if exporting individual chat (e.g. Chat de WhatsApp con +5493416123456.txt)
    match_filename_phone = re.search(r'(\d{10,13})', filename)
    default_phone = match_filename_phone.group(1) if match_filename_phone else ''
    match_filename_name = re.search(r'Chat\s+de\s+WhatsApp\s+con\s+(.*?)(?:\.txt|\.csv|$)', filename, re.IGNORECASE)
    default_name = match_filename_name.group(1).strip() if match_filename_name else ''
    
    lines = file_content_str.splitlines()
    
    # Regex to match WhatsApp exported chat line formats
    # Formats:
    # 1. 15/04/2020, 14:32 - Nombre o Teléfono: Mensaje
    # 2. [15/04/2020 14:32:15] Nombre o Teléfono: Mensaje
    # 3. 15.04.20, 14:32 - Nombre o Teléfono: Mensaje
    pattern = re.compile(
        r'^(?:\[?(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[aApP]\.?[mM]\.?)?)\]?)\s*[\-\:]?\s*([^:]+):\s*(.*)$'
    )
    
    with get_connection() as conn:
        with conn.cursor() as cursor:
            current_sender = default_name or default_phone or "Cliente WhatsApp"
            
            for line in lines:
                line_str = line.strip()
                if not line_str:
                    continue
                
                m = pattern.match(line_str)
                if m:
                    sender_part = m.group(3).strip()
                    msg_text = m.group(4).strip()
                    
                    # Omit WhatsApp system messages like "<Media omitted>", "Los mensajes y las llamadas están cifrados", etc.
                    if "<Media omitted>" in msg_text or "archivos multimedia omitidos" in msg_text.lower() or "cifrados de extremo a extremo" in msg_text.lower():
                        continue
                    
                    if sender_part and msg_text:
                        current_sender = sender_part
                        # Clean phone digits if sender is phone number
                        clean_digits = re.sub(r'[^0-9]', '', sender_part)
                        sender_key = clean_digits if len(clean_digits) >= 10 else sender_part
                        
                        # Insert message
                        cursor.execute("""
                            INSERT INTO whatsapp_chat_history (sender, message, reply, timestamp)
                            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        """, (sender_key, msg_text, '[Histórico Importado por Copia Backup]'))
                        imported_messages += 1
                        
                        if sender_key not in contacts_map:
                            contacts_map[sender_key] = sender_part
                else:
                    # Multi-line message continuation
                    if line_str and current_sender and imported_messages > 0:
                        clean_digits = re.sub(r'[^0-9]', '', current_sender)
                        sender_key = clean_digits if len(clean_digits) >= 10 else current_sender
                        cursor.execute("""
                            INSERT INTO whatsapp_chat_history (sender, message, reply, timestamp)
                            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        """, (sender_key, line_str, '[Histórico Importado]'))
                        imported_messages += 1

            # Fallback for binary / crypt database files if line parsing found no text format lines
            if imported_messages == 0:
                raw_phones = set(re.findall(r'(?:549|54|341|\+54)?\d{8,12}', file_content_str))
                for phone_candidate in raw_phones:
                    clean_phone = re.sub(r'[^0-9]', '', phone_candidate)
                    if len(clean_phone) >= 10:
                        contacts_map[clean_phone] = f"Contacto WA +{clean_phone}"

            # Sync parsed contacts into customers table
            for key, name in contacts_map.items():
                clean_phone = re.sub(r'[^0-9]', '', key)
                cursor.execute("SELECT buyer_id FROM customers WHERE phone = %s OR nickname = %s", (clean_phone or key, key))
                existing = cursor.fetchone()
                if not existing:
                    new_buyer_id = int(time.time() * 1000) + imported_contacts
                    cursor.execute("""
                        INSERT INTO customers (buyer_id, nickname, full_name, phone, source_platform)
                        VALUES (%s, %s, %s, %s, 'WHATSAPP')
                        ON CONFLICT (tenant_id, buyer_id) DO NOTHING
                    """, (new_buyer_id, name, name, clean_phone or key))
                    imported_contacts += 1

    # Run AI inquiry extraction on imported history
    analyzed = run_historical_whatsapp_chat_analysis()
    
    return {
        'imported_messages': imported_messages,
        'imported_contacts': imported_contacts,
        'analyzed_inquiries': analyzed
    }

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

def get_dashboard_metrics(period="total", start_date_str=None, end_date_str=None):
    from datetime import datetime, timedelta
    start_date = None
    end_date = None
    
    if period == "custom" and start_date_str:
        try:
            start_date = datetime.fromisoformat(start_date_str.replace("Z", ""))
        except Exception:
            pass
        if end_date_str:
            try:
                ed = datetime.fromisoformat(end_date_str.replace("Z", ""))
                if ed.hour == 0 and ed.minute == 0 and ed.second == 0:
                    ed = ed.replace(hour=23, minute=59, second=59, microsecond=999999)
                end_date = ed
            except Exception:
                pass
    elif period != "total":
        now = datetime.now()
        if period == "day":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start_date = now - timedelta(days=7)
        elif period == "month":
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "year":
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    orders_conditions = ["LOWER(status) NOT IN ('cancelled', 'cancelado')"]
    orders_params = []
    if start_date:
        orders_conditions.append("date_created >= %s")
        orders_params.append(start_date.isoformat())
    if end_date:
        orders_conditions.append("date_created <= %s")
        orders_params.append(end_date.isoformat())

    orders_where = " WHERE " + " AND ".join(orders_conditions)

    with get_connection() as conn:
        with conn.cursor() as cursor:
            sales_query = "SELECT COUNT(order_id) as count, SUM(total_amount) as total FROM orders_cache" + orders_where
            cursor.execute(sales_query, tuple(orders_params))
            sales_row = cursor.fetchone()
            total_sales = sales_row['count'] or 0
            sales_revenue = sales_row['total'] or 0.0

            # Manual incomes from incomes table for the period
            incomes_conditions = []
            incomes_params = []
            if start_date:
                incomes_conditions.append("date >= %s")
                incomes_params.append(start_date.strftime("%Y-%m-%d"))
            if end_date:
                incomes_conditions.append("date <= %s")
                incomes_params.append(end_date.strftime("%Y-%m-%d"))
            incomes_where = (" WHERE " + " AND ".join(incomes_conditions)) if incomes_conditions else ""
            incomes_query = f"SELECT SUM(amount) as total FROM incomes{incomes_where}"
            cursor.execute(incomes_query, tuple(incomes_params))
            incomes_row = cursor.fetchone()
            manual_incomes = incomes_row['total'] if incomes_row and incomes_row['total'] else 0.0

            total_revenue = sales_revenue + manual_incomes
            
            cursor.execute("SELECT COUNT(ml_id) as count FROM products_cache WHERE status = 'active'")
            total_active_products = cursor.fetchone()['count'] or 0
            
            items_query = "SELECT items_json, source_platform FROM orders_cache" + orders_where
            cursor.execute(items_query, tuple(orders_params))
            orders_items = cursor.fetchall()
            
            cursor.execute("SELECT ml_id, cost_price, cost_meli FROM products_cache")
            costs = {r['ml_id']: (r['cost_price'], r['cost_meli']) for r in cursor.fetchall()}
            
            total_cost = 0.0
            for row in orders_items:
                source_platform = row.get('source_platform', 'MERCADOLIBRE')
                items = json.loads(row['items_json']) if row.get('items_json') else []
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
            # Variable expenses for the period (excluding money transfers and card payments)
            var_conditions = ["category NOT IN ('Transferencias Salientes MP', 'Pago de Tarjeta MP')"]
            var_params = []
            if start_date:
                var_conditions.append("date >= %s")
                var_params.append(start_date.strftime("%Y-%m-%d"))
            if end_date:
                var_conditions.append("date <= %s")
                var_params.append(end_date.strftime("%Y-%m-%d"))
            var_where = " WHERE " + " AND ".join(var_conditions)
            var_query = f"SELECT SUM(amount) as total FROM variable_expenses{var_where}"
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
            elif period == "custom" and start_date and end_date:
                fixed_query += " WHERE (year > %s OR (year = %s AND month >= %s)) AND (year < %s OR (year = %s AND month <= %s))"
                fixed_params.extend([start_date.year, start_date.year, start_date.month, end_date.year, end_date.year, end_date.month])
            
            cursor.execute(fixed_query, tuple(fixed_params))
            fixed_row = cursor.fetchone()
            total_fixed_raw = fixed_row['total'] if fixed_row and fixed_row['total'] else 0.0
            
            total_fixed_expenses = total_fixed_raw
            if period == "day":
                total_fixed_expenses = total_fixed_raw / 30.0
            elif period == "week":
                total_fixed_expenses = total_fixed_raw / 4.333
            elif period == "custom" and start_date and end_date:
                days_diff = max(1, (end_date - start_date).days + 1)
                total_fixed_expenses = (total_fixed_raw / 30.0) * days_diff

            total_expenses = total_var_expenses + total_fixed_expenses
            
            # Net profit = Revenue - Expenses (matching Finanzas as requested)
            total_profit = total_revenue - total_expenses
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
            
            visit_conditions = []
            visit_params = []
            if start_date:
                visit_conditions.append("timestamp >= %s")
                visit_params.append(start_date)
            if end_date:
                visit_conditions.append("timestamp <= %s")
                visit_params.append(end_date)
                
            visit_where = (" WHERE " + " AND ".join(visit_conditions)) if visit_conditions else ""
                
            cursor.execute(f"SELECT COUNT(*) as count FROM web_visits_log{visit_where}", tuple(visit_params))
            logged_visits_web = cursor.fetchone()['count'] or 0
            
            if logged_visits_web > 0 or period != "total" or start_date or end_date:
                total_visits_web = logged_visits_web
            else:
                cursor.execute("SELECT SUM(visits_web) as web FROM products_cache")
                total_visits_web = cursor.fetchone()['web'] or 0

            web_log_counts = {}
            if period != "total" or start_date or end_date:
                cursor.execute(f"SELECT ml_id, COUNT(*) as count FROM web_visits_log{visit_where} GROUP BY ml_id", tuple(visit_params))
                web_log_counts = {r['ml_id']: r['count'] for r in cursor.fetchall() if r['ml_id']}

            cursor.execute("SELECT ml_id, title, visits_meli, visits_web FROM products_cache")
            all_prods = [dict(r) for r in cursor.fetchall()]
            for p in all_prods:
                if period != "total" or start_date or end_date:
                    p['visits_web'] = web_log_counts.get(p['ml_id'], 0)

            all_prods.sort(key=lambda x: (x['visits_meli'] + x['visits_web']), reverse=True)
            top_products = [p for p in all_prods if p.get('visits_meli', 0) > 0 or p.get('visits_web', 0) > 0][:100]
            if not top_products:
                top_products = all_prods[:20]

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
        permissions = "dashboard,inventory,sales,billing,expenses,customers,media,settings,inpi,marketing,blog"
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

def delete_order_by_id(order_id: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM orders_cache WHERE order_id = %s", (order_id,))

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
            "cost_today_usd": 0.0, "cost_month_usd": 0.0,
            "free_tier_rpm_limit": 15, "free_tier_tpm_limit": 1000000
        }

# --- Mercado Pago Helpers ---

def save_auto_mp_expense(date_str, description, amount, category, mp_payment_id):
    """Inserts or updates an automatically generated Mercado Pago fee/expense."""
    if amount <= 0:
        return
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Check if user explicitly deleted this MP expense
            cursor.execute("SELECT 1 FROM deleted_mp_expenses WHERE mp_payment_id = %s", (mp_payment_id,))
            if cursor.fetchone():
                return  # Do not recreate deleted expense

            cursor.execute("SELECT id FROM variable_expenses WHERE mp_payment_id = %s AND category = %s", (mp_payment_id, category))
            existing = cursor.fetchone()
            if existing:
                cursor.execute("""
                    UPDATE variable_expenses 
                    SET amount = %s, description = %s, date = %s
                    WHERE id = %s
                """, (amount, description, date_str, existing['id']))
            else:
                cursor.execute("""
                    INSERT INTO variable_expenses (date, description, amount, category, mp_payment_id, is_auto_mp)
                    VALUES (%s, %s, %s, %s, %s, 1)
                """, (date_str, description, amount, category, mp_payment_id))

def link_order_inventory(order_id, items_list, cost_amount):
    """Updates order items, costs, and marks inventory_linked = 1."""
    import json
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                UPDATE orders_cache 
                SET items_json = %s, cost_amount = %s, inventory_linked = 1
                WHERE order_id = %s
            """, (json.dumps(items_list), cost_amount, order_id))

# --- Blog Operations ---

def get_all_blog_posts(is_published_only=False):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            query = "SELECT * FROM blog_posts"
            if is_published_only:
                query += " WHERE is_published = 1"
            query += " ORDER BY published_at DESC"
            cursor.execute(query)
            return cursor.fetchall()

def get_blog_post_by_id(post_id: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM blog_posts WHERE id = %s", (post_id,))
            return cursor.fetchone()

def get_blog_post_by_slug(slug: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM blog_posts WHERE slug = %s", (slug,))
            return cursor.fetchone()

def create_blog_post(title: str, slug: str, category: str, summary: str, content: str, cover_image: str, published_at: str, is_published: int, author: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO blog_posts (title, slug, category, summary, content, cover_image, published_at, is_published, author)
                VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s::timestamp, CURRENT_TIMESTAMP), %s, %s)
                RETURNING *
            """, (title, slug, category or 'General', summary or '', content, cover_image or '', published_at or None, is_published, author or 'Equipo Hidroponia Rosario'))
            return cursor.fetchone()

def update_blog_post(post_id: int, title: str, slug: str, category: str, summary: str, content: str, cover_image: str, published_at: str, is_published: int, author: str):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                UPDATE blog_posts 
                SET title = %s, slug = %s, category = %s, summary = %s, content = %s, cover_image = %s,
                    published_at = COALESCE(%s::timestamp, published_at), is_published = %s, author = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING *
            """, (title, slug, category or 'General', summary or '', content, cover_image or '', published_at or None, is_published, author or 'Equipo Hidroponia Rosario', post_id))
            return cursor.fetchone()

def delete_blog_post(post_id: int):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM blog_posts WHERE id = %s", (post_id,))
            return True

# --- WhatsApp Human Takeover & Paused Chats ---

def pause_whatsapp_ai(sender: str, duration_hours: int = 24, reason: str = 'human_takeover'):
    """Pauses WhatsApp AI responses for a specific sender phone for N hours."""
    clean_sender = (sender or "").strip()
    if not clean_sender:
        return
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO whatsapp_paused_chats (sender, paused_until, reason, created_at)
                VALUES (%s, CURRENT_TIMESTAMP + (%s || ' hours')::interval, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (tenant_id, sender) DO UPDATE
                SET paused_until = CURRENT_TIMESTAMP + (%s || ' hours')::interval, reason = EXCLUDED.reason, created_at = CURRENT_TIMESTAMP
            """, (clean_sender, str(int(duration_hours)), reason, str(int(duration_hours))))

def is_whatsapp_ai_paused(sender: str) -> bool:
    """Checks if WhatsApp AI is currently paused for a sender."""
    clean_sender = (sender or "").strip()
    if not clean_sender:
        return False
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 1 FROM whatsapp_paused_chats 
                    WHERE sender = %s AND paused_until > CURRENT_TIMESTAMP
                """, (clean_sender,))
                return cursor.fetchone() is not None
    except Exception as e:
        print(f"[is_whatsapp_ai_paused error] {e}")
        return False

def unpause_whatsapp_ai(sender: str):
    """Manually unpauses WhatsApp AI for a sender."""
    clean_sender = (sender or "").strip()
    if not clean_sender:
        return
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM whatsapp_paused_chats WHERE sender = %s", (clean_sender,))

def get_whatsapp_paused_chats():
    """Fetches list of all active paused chats."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT sender, paused_until, reason, created_at 
                    FROM whatsapp_paused_chats 
                    WHERE paused_until > CURRENT_TIMESTAMP 
                    ORDER BY created_at DESC
                """)
                return cursor.fetchall()
    except Exception as e:
        print(f"[get_whatsapp_paused_chats error] {e}")
        return []

# --- WhatsApp Schedule ---

def is_whatsapp_in_schedule() -> bool:
    """Checks if the WhatsApp AI assistant is currently within its active schedule.
    Returns True if the bot should respond, False if outside scheduled hours.
    If no schedule is configured or schedule is disabled, returns True (always active)."""
    try:
        schedule_json = get_setting('whatsapp_schedule', '')
        if not schedule_json:
            return True
        schedule = json.loads(schedule_json)
        if not schedule.get('enabled', False):
            return True

        tz_name = schedule.get('timezone', 'America/Argentina/Buenos_Aires')
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo('America/Argentina/Buenos_Aires')

        now = datetime.now(tz)
        day_names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        current_day = day_names[now.weekday()]
        current_time = now.strftime('%H:%M')

        days_config = schedule.get('days', {})
        day_config = days_config.get(current_day, {'mode': 'allday'})
        mode = day_config.get('mode', 'allday')

        if mode == 'allday':
            return True
        elif mode == 'off':
            return False
        elif mode == 'range':
            ranges = day_config.get('ranges', [])
            if not ranges:
                return False
            for r in ranges:
                from_time = r.get('from', '00:00')
                to_time = r.get('to', '23:59')
                if from_time <= to_time:
                    if from_time <= current_time <= to_time:
                        return True
                else:
                    # Wraps midnight (e.g. 20:00 -> 06:00)
                    if current_time >= from_time or current_time <= to_time:
                        return True
            return False
        else:
            return True
    except Exception as e:
        print(f"[is_whatsapp_in_schedule error] {e}")
        return True  # On error, default to active

def get_whatsapp_off_schedule_message() -> str:
    """Returns the configured message for when the bot is outside its schedule.
    Returns empty string if no message is configured (silent mode)."""
    try:
        schedule_json = get_setting('whatsapp_schedule', '')
        if not schedule_json:
            return ''
        schedule = json.loads(schedule_json)
        return schedule.get('off_schedule_message', '')
    except Exception:
        return ''

# --- Leads Operations ---

def save_lead(name: str, email: str, country: str = "Argentina", source: str = "popup_lead", pdf_sent: str = ""):
    """Inserts or updates a lead subscriber in the database."""
    clean_email = (email or "").strip().lower()
    if not clean_email:
        return False
    clean_name = (name or "").strip()
    clean_country = (country or "Argentina").strip()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO leads (name, email, country, source, pdf_sent)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, email) DO UPDATE SET
                    name = CASE WHEN EXCLUDED.name != '' THEN EXCLUDED.name ELSE leads.name END,
                    country = CASE WHEN EXCLUDED.country != '' THEN EXCLUDED.country ELSE leads.country END,
                    source = EXCLUDED.source,
                    pdf_sent = EXCLUDED.pdf_sent,
                    created_at = CURRENT_TIMESTAMP
            """, (clean_name, clean_email, clean_country, source, pdf_sent))
            return True

def get_all_leads():
    """Fetches all leads sorted by newest first."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT id, name, email, country, source, pdf_sent, created_at
                    FROM leads
                    ORDER BY created_at DESC
                """)
                rows = cursor.fetchall()
                return [dict(r) for r in rows]
    except Exception as e:
        print(f"[get_all_leads error] {e}")
        return []

def delete_lead(lead_id: int):
    """Deletes a lead by ID."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM leads WHERE id = %s", (lead_id,))
            return True

# --- Monitored Trademarks (INPI) ---

def get_all_monitored_trademarks():
    """Obtiene todas las marcas registradas en el portafolio de seguimiento."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT id, acta, denominacion, clase, tipo_marca, titulares,
                           numero_resolucion, estado, fecha_ingreso, fecha_concesion_estimada,
                           fecha_vencimiento_10anos, requiere_djumt, djumt_codigo, djumt_mensaje,
                           image_url, notes, last_checked_at, created_at
                    FROM monitored_trademarks
                    ORDER BY id DESC
                """)
                rows = cursor.fetchall()
                result = []
                for r in rows:
                    item = dict(r)
                    if isinstance(item.get('last_checked_at'), datetime):
                        item['last_checked_at'] = item['last_checked_at'].isoformat()
                    if isinstance(item.get('created_at'), datetime):
                        item['created_at'] = item['created_at'].isoformat()
                    result.append(item)
                return result
    except Exception as e:
        print(f"[get_all_monitored_trademarks error] {e}")
        return []

def add_monitored_trademark(item: dict):
    """Agrega una nueva marca al seguimiento diario."""
    acta = str(item.get('Acta') or item.get('acta') or '').strip()
    if not acta:
        raise ValueError("El número de Acta es obligatorio para monitorear una marca.")

    denominacion = str(item.get('Denominacion') or item.get('denominacion') or '').strip()
    clase = item.get('Clase') or item.get('clase')
    try:
        clase = int(clase) if clase else None
    except ValueError:
        clase = None

    tipo_marca = str(item.get('Tipo_Marca') or item.get('tipo_marca') or '')
    titulares = str(item.get('Titulares') or item.get('titulares') or '')
    numero_resolucion = str(item.get('Numero_Resolucion') or item.get('numero_resolucion') or '')
    estado = str(item.get('Estado') or item.get('estado') or '')
    fecha_ingreso = str(item.get('Fecha_Ingreso') or item.get('fecha_ingreso') or '')
    fecha_concesion = str(item.get('fecha_concesion_estimada') or '')
    fecha_vencimiento = str(item.get('fecha_vencimiento_10anos') or '')
    requiere_djumt = bool(item.get('requiere_djumt', False))
    djumt_codigo = str(item.get('djumt_codigo') or 'NO_APLICA')
    djumt_mensaje = str(item.get('djumt_mensaje') or '')
    image_url = str(item.get('image_url') or '')
    notes = str(item.get('notes') or '')

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO monitored_trademarks (
                    acta, denominacion, clase, tipo_marca, titulares, numero_resolucion,
                    estado, fecha_ingreso, fecha_concesion_estimada, fecha_vencimiento_10anos,
                    requiere_djumt, djumt_codigo, djumt_mensaje, image_url, notes, last_checked_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (tenant_id, acta) DO UPDATE SET
                    denominacion = EXCLUDED.denominacion,
                    clase = EXCLUDED.clase,
                    tipo_marca = EXCLUDED.tipo_marca,
                    titulares = EXCLUDED.titulares,
                    numero_resolucion = EXCLUDED.numero_resolucion,
                    estado = EXCLUDED.estado,
                    fecha_ingreso = EXCLUDED.fecha_ingreso,
                    fecha_concesion_estimada = EXCLUDED.fecha_concesion_estimada,
                    fecha_vencimiento_10anos = EXCLUDED.fecha_vencimiento_10anos,
                    requiere_djumt = EXCLUDED.requiere_djumt,
                    djumt_codigo = EXCLUDED.djumt_codigo,
                    djumt_mensaje = EXCLUDED.djumt_mensaje,
                    last_checked_at = CURRENT_TIMESTAMP
                RETURNING id
            ''', (
                acta, denominacion, clase, tipo_marca, titulares, numero_resolucion,
                estado, fecha_ingreso, fecha_concesion, fecha_vencimiento,
                requiere_djumt, djumt_codigo, djumt_mensaje, image_url, notes
            ))
            return cursor.fetchone()['id']

def delete_monitored_trademark(acta: str):
    """Elimina una marca del seguimiento."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM monitored_trademarks WHERE acta = %s", (str(acta).strip(),))
            return True

def update_monitored_trademark_image(acta: str, image_url: str):
    """Actualiza la URL del logo o imagen de una marca monitoreada."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE monitored_trademarks SET image_url = %s WHERE acta = %s", (image_url.strip(), str(acta).strip()))
            return True

def update_monitored_trademark_data(acta: str, item: dict):
    """Actualiza los datos provenientes de la re-consulta en INPI."""
    numero_resolucion = str(item.get('Numero_Resolucion') or item.get('numero_resolucion') or '')
    estado = str(item.get('Estado') or item.get('estado') or '')
    fecha_concesion = str(item.get('fecha_concesion_estimada') or '')
    fecha_vencimiento = str(item.get('fecha_vencimiento_10anos') or '')
    requiere_djumt = bool(item.get('requiere_djumt', False))
    djumt_codigo = str(item.get('djumt_codigo') or 'NO_APLICA')
    djumt_mensaje = str(item.get('djumt_mensaje') or '')

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                UPDATE monitored_trademarks
                SET numero_resolucion = %s,
                    estado = %s,
                    fecha_concesion_estimada = %s,
                    fecha_vencimiento_10anos = %s,
                    requiere_djumt = %s,
                    djumt_codigo = %s,
                    djumt_mensaje = %s,
                    last_checked_at = CURRENT_TIMESTAMP
                WHERE acta = %s
            ''', (
                numero_resolucion, estado, fecha_concesion, fecha_vencimiento,
                requiere_djumt, djumt_codigo, djumt_mensaje, str(acta).strip()
            ))
            return True

def get_system_notifications():
    """Compila las notificaciones de eventos importantes (INPI, Ventas, Stock)."""
    notifications = []
    
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # 1. Alertas de Propiedad Industrial (INPI)
            try:
                cursor.execute('''
                    SELECT acta, denominacion, djumt_codigo, djumt_mensaje
                    FROM monitored_trademarks
                    WHERE djumt_codigo IN ('PRESENTAR_AHORA', 'EN_MORA')
                ''')
                rows = cursor.fetchall()
                for r in rows:
                    acta = r['acta']
                    denom = r['denominacion']
                    code = r['djumt_codigo']
                    if code == 'EN_MORA':
                        notifications.append({
                            'id': f'inpi_mora_{acta}',
                            'category': 'inpi',
                            'severity': 'danger',
                            'title': f'⚠️ DJUMT Vencida: {denom}',
                            'message': f'La marca (Acta #{acta}) supera los 6 años sin Declaración Jurada de Uso.',
                            'link': '/inpi',
                            'time': 'Urgente'
                        })
                    elif code == 'PRESENTAR_AHORA':
                        notifications.append({
                            'id': f'inpi_ahora_{acta}',
                            'category': 'inpi',
                            'severity': 'warning',
                            'title': f'🟠 Presentar DJUMT: {denom}',
                            'message': f'Ventanilla abierta (5° a 6° año) para Acta #{acta}.',
                            'link': '/inpi',
                            'time': 'En ventana'
                        })
            except Exception as err:
                print("[Database] Error fetching INPI notifications:", err)

            # 2. Nuevas Ventas Recientes (Últimas ventas sincronizadas de MeLi, MP, Web, Local)
            try:
                cursor.execute('''
                    SELECT order_id, buyer_nickname, buyer_name, total_amount, source_platform, date_created
                    FROM orders_cache
                    ORDER BY date_created DESC
                    LIMIT 10
                ''')
                sales_rows = cursor.fetchall()
                for s in sales_rows:
                    sale_id = s['order_id']
                    buyer = s['buyer_name'] or s['buyer_nickname'] or 'Cliente'
                    total = float(s['total_amount'] or 0)
                    platform = s['source_platform'] or 'Mercado Libre'
                    raw_date = s.get('date_created')
                    
                    time_str = 'Hoy'
                    if raw_date:
                        try:
                            clean_dt = str(raw_date).replace('Z', '')
                            if 'T' in clean_dt:
                                dt_part, tm_part = clean_dt.split('T')
                                y, m, d = dt_part.split('-')
                                time_hhmm = tm_part.split('.')[0][:5]
                                time_str = f"{d}/{m} {time_hhmm} hs"
                            else:
                                time_str = str(raw_date)[:16]
                        except Exception:
                            time_str = 'Reciente'

                    notifications.append({
                        'id': f'sale_{sale_id}',
                        'category': 'sales',
                        'severity': 'info',
                        'title': f'🛒 Nueva Venta ({platform}): ${total:,.2f}',
                        'message': f'Comprador: {buyer} (Orden #{sale_id})',
                        'link': '/sales',
                        'time': time_str
                    })
            except Exception as err:
                print("[Database] Error fetching sales notifications:", err)

            # 3. Alertas de Stock Crítico (Inventario)
            try:
                cursor.execute('''
                    SELECT ml_id, title, available_quantity
                    FROM products_cache
                    WHERE available_quantity <= 3 AND COALESCE(is_hidden, 0) = 0
                    ORDER BY available_quantity ASC
                    LIMIT 5
                ''')
                stock_rows = cursor.fetchall()
                for p in stock_rows:
                    ml_id = p['ml_id']
                    title = p['title'] or 'Producto'
                    stk = p['available_quantity'] or 0
                    notifications.append({
                        'id': f'stock_{ml_id}',
                        'category': 'inventory',
                        'severity': 'danger' if stk == 0 else 'warning',
                        'title': f'📦 Stock Crítico ({stk} u.): {title[:28]}',
                        'message': 'Sin stock' if stk == 0 else f'Quedan solo {stk} unidades disponibles.',
                        'link': '/inventory',
                        'time': 'Inventario'
                    })
            except Exception as err:
                print("[Database] Error fetching stock notifications:", err)

            # 4. Alertas de Leads / Suscriptores Recientes
            try:
                cursor.execute('''
                    SELECT id, name, email, country, created_at
                    FROM leads
                    ORDER BY id DESC
                    LIMIT 5
                ''')
                lead_rows = cursor.fetchall()
                for l in lead_rows:
                    lead_id = l['id']
                    name_disp = l['name'].strip() if l.get('name') else l['email'].split('@')[0]
                    email_disp = l['email']
                    country_disp = l.get('country') or 'Argentina'
                    time_str = l['created_at'].strftime('%d/%m %H:%M') if l.get('created_at') else 'Lead'
                    notifications.append({
                        'id': f'lead_{lead_id}',
                        'category': 'leads',
                        'severity': 'info',
                        'title': f'🌱 Nuevo Lead: {name_disp}',
                        'message': f'Email: {email_disp} ({country_disp})',
                        'link': '/settings?tab=lead_popup',
                        'time': time_str
                    })
            except Exception as err:
                print("[Database] Error fetching lead notifications:", err)

            # 5. Notificaciones de WhatsApp (Solicitudes de Atención Humana y Consultas)
            try:
                cursor.execute('''
                    SELECT sender, reason, created_at
                    FROM whatsapp_paused_chats
                    ORDER BY created_at DESC
                    LIMIT 5
                ''')
                paused_rows = cursor.fetchall()
                for p in paused_rows:
                    sender = p['sender']
                    time_str = p['created_at'].strftime('%d/%m %H:%M') if p.get('created_at') else 'WhatsApp'
                    notifications.append({
                        'id': f'wa_paused_{sender}',
                        'category': 'whatsapp',
                        'severity': 'warning',
                        'title': f'💬 Atención Humana: +{sender}',
                        'message': 'El cliente solicitó hablar con un asesor o se pausó el bot.',
                        'link': '/settings?tab=whatsapp',
                        'time': time_str
                    })
            except Exception as err:
                print("[Database] Error fetching WhatsApp paused chat notifications:", err)

    return {
        'notifications': notifications,
        'unread_count': len(notifications)
    }

# --- Marketing Operations ---

def create_marketing_post(post_data):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO marketing_posts 
                (product_ml_id, title, post_type, platforms, caption, media_urls, scheduled_at, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            ''', (
                post_data.get('product_ml_id'),
                post_data.get('title', 'Publicación'),
                post_data.get('post_type', 'post'),
                post_data.get('platforms', 'instagram,facebook'),
                post_data.get('caption', ''),
                post_data.get('media_urls', ''),
                post_data.get('scheduled_at'),
                post_data.get('status', 'draft')
            ))
            row = cursor.fetchone()
            return row['id'] if row else None

def get_marketing_posts(status=None, limit=100):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            sql = "SELECT * FROM marketing_posts WHERE 1=1"
            params = []
            if status:
                sql += " AND status = %s"
                params.append(status)
            sql += " ORDER BY created_at DESC LIMIT %s"
            params.append(limit)
            cursor.execute(sql, params)
            return [dict(r) for r in cursor.fetchall()]

def get_marketing_post_by_id(post_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM marketing_posts WHERE id = %s", (post_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

def update_marketing_post_status(post_id, status, external_post_id=None, error_message=None):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            if status == 'published':
                cursor.execute('''
                    UPDATE marketing_posts 
                    SET status = %s, external_post_id = %s, published_at = %s, error_message = NULL
                    WHERE id = %s
                ''', (status, external_post_id, now, post_id))
            else:
                cursor.execute('''
                    UPDATE marketing_posts 
                    SET status = %s, error_message = %s
                    WHERE id = %s
                ''', (status, error_message, post_id))

def delete_marketing_post(post_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM marketing_posts WHERE id = %s", (post_id,))

def update_marketing_post(post_id, post_data):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                UPDATE marketing_posts
                SET product_ml_id = %s,
                    title = %s,
                    post_type = %s,
                    platforms = %s,
                    caption = %s,
                    media_urls = %s,
                    scheduled_at = %s,
                    status = %s
                WHERE id = %s
            ''', (
                post_data.get('product_ml_id'),
                post_data.get('title', 'Publicación'),
                post_data.get('post_type', 'post'),
                post_data.get('platforms', 'instagram,facebook'),
                post_data.get('caption', ''),
                post_data.get('media_urls', ''),
                post_data.get('scheduled_at'),
                post_data.get('status', 'draft'),
                post_id
            ))

def get_due_scheduled_marketing_posts():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT * FROM marketing_posts 
                WHERE status = 'scheduled' 
                  AND scheduled_at IS NOT NULL 
                  AND scheduled_at <= CURRENT_TIMESTAMP
                ORDER BY scheduled_at ASC
            ''')
            return [dict(r) for r in cursor.fetchall()]

# ---------------------------------------------------------------------
# Diffusion Groups & Campaign Management Functions
# ---------------------------------------------------------------------

def create_diffusion_group(data):
    name = data.get('name')
    description = data.get('description', '')
    channel_type = data.get('channel_type', 'both')
    criteria_json = json.dumps(data.get('criteria_json', {})) if isinstance(data.get('criteria_json'), dict) else (data.get('criteria_json') or '{}')
    
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO diffusion_groups (name, description, channel_type, criteria_json, created_at, updated_at)
                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
            ''', (name, description, channel_type, criteria_json))
            row = cursor.fetchone()
            return row['id'] if row else None

def get_diffusion_groups():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT g.*, 
                       COUNT(m.id) AS member_count,
                       COUNT(CASE WHEN m.phone IS NOT NULL AND m.phone != '' THEN 1 END) AS whatsapp_member_count,
                       COUNT(CASE WHEN m.email IS NOT NULL AND m.email != '' THEN 1 END) AS email_member_count
                FROM diffusion_groups g
                LEFT JOIN diffusion_group_members m ON g.id = m.group_id
                GROUP BY g.id
                ORDER BY g.created_at DESC
            ''')
            return [dict(r) for r in cursor.fetchall()]

def get_diffusion_group_by_id(group_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT * FROM diffusion_groups WHERE id = %s', (group_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

def delete_diffusion_group(group_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM diffusion_groups WHERE id = %s', (group_id,))
            return True

def add_group_members(group_id, members):
    """
    members: list of dicts with keys: customer_id, contact_name, phone, email, source
    """
    added_count = 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for m in members:
                c_id = m.get('customer_id')
                name = m.get('contact_name') or m.get('full_name') or m.get('nickname') or ''
                phone = m.get('phone') or ''
                email = m.get('email') or ''
                source = m.get('source') or 'MANUAL'
                
                # Clean phone number (keep numbers only)
                clean_phone = "".join([ch for ch in phone if ch.isdigit()])
                
                # Check for duplicate in same group
                if clean_phone:
                    cursor.execute('SELECT id FROM diffusion_group_members WHERE group_id = %s AND phone = %s', (group_id, clean_phone))
                    if cursor.fetchone():
                        continue
                elif email:
                    cursor.execute('SELECT id FROM diffusion_group_members WHERE group_id = %s AND LOWER(email) = LOWER(%s)', (group_id, email))
                    if cursor.fetchone():
                        continue

                cursor.execute('''
                    INSERT INTO diffusion_group_members (group_id, customer_id, contact_name, phone, email, source)
                    VALUES (%s, %s, %s, %s, %s, %s)
                ''', (group_id, c_id, name, clean_phone, email, source))
                added_count += 1

            # Update updated_at of group
            cursor.execute('UPDATE diffusion_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = %s', (group_id,))
    return added_count

def get_group_members(group_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT * FROM diffusion_group_members WHERE group_id = %s ORDER BY created_at DESC', (group_id,))
            return [dict(r) for r in cursor.fetchall()]

def delete_group_member(member_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM diffusion_group_members WHERE id = %s', (member_id,))
            return True

def create_diffusion_campaign(data):
    title = data.get('title', 'Campaña de Difusión')
    channel = data.get('channel', 'whatsapp')
    group_id = data.get('group_id')
    post_id = data.get('post_id')
    message_text = data.get('message_text', '')
    media_url = data.get('media_url', '')
    total_targets = data.get('total_targets', 0)
    
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO diffusion_campaigns 
                (title, channel, group_id, post_id, message_text, media_url, status, total_targets, sent_count, failed_count, logs_json, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, 'sending', %s, 0, 0, '[]', CURRENT_TIMESTAMP)
                RETURNING id
            ''', (title, channel, group_id, post_id, message_text, media_url, total_targets))
            row = cursor.fetchone()
            return row['id'] if row else None

def get_diffusion_campaigns():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT c.*, g.name AS group_name
                FROM diffusion_campaigns c
                LEFT JOIN diffusion_groups g ON c.group_id = g.id
                ORDER BY c.created_at DESC
            ''')
            return [dict(r) for r in cursor.fetchall()]

def get_diffusion_campaign_by_id(campaign_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT * FROM diffusion_campaigns WHERE id = %s', (campaign_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

def update_diffusion_campaign(campaign_id, updates):
    """
    updates can contain: status, sent_count, failed_count, logs_json, completed_at
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            fields = []
            values = []
            if 'status' in updates:
                fields.append('status = %s')
                values.append(updates['status'])
            if 'sent_count' in updates:
                fields.append('sent_count = %s')
                values.append(updates['sent_count'])
            if 'failed_count' in updates:
                fields.append('failed_count = %s')
                values.append(updates['failed_count'])
            if 'logs_json' in updates:
                logs_val = updates['logs_json']
                if isinstance(logs_val, (list, dict)):
                    logs_val = json.dumps(logs_val)
                fields.append('logs_json = %s')
                values.append(logs_val)
            if updates.get('completed'):
                fields.append('completed_at = CURRENT_TIMESTAMP')
            
            if fields:
                query = f"UPDATE diffusion_campaigns SET {', '.join(fields)} WHERE id = %s"
                values.append(campaign_id)
                cursor.execute(query, tuple(values))
    return True


# --- Mercado Libre AI Questions Operations ---

def create_or_update_meli_question(q_data: dict):
    """
    q_data keys:
    question_id, item_id, item_title, buyer_id, buyer_nickname, question_text,
    answer_text, ai_model_used, status, auto_replied, response_time_ms, error_message, answered_at
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                INSERT INTO meli_questions (
                    question_id, item_id, item_title, buyer_id, buyer_nickname,
                    question_text, answer_text, ai_model_used, status, auto_replied,
                    response_time_ms, error_message, answered_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (question_id) DO UPDATE SET
                    item_id = EXCLUDED.item_id,
                    item_title = EXCLUDED.item_title,
                    buyer_id = EXCLUDED.buyer_id,
                    buyer_nickname = EXCLUDED.buyer_nickname,
                    question_text = EXCLUDED.question_text,
                    answer_text = EXCLUDED.answer_text,
                    ai_model_used = EXCLUDED.ai_model_used,
                    status = EXCLUDED.status,
                    auto_replied = EXCLUDED.auto_replied,
                    response_time_ms = EXCLUDED.response_time_ms,
                    error_message = EXCLUDED.error_message,
                    answered_at = EXCLUDED.answered_at
            ''', (
                str(q_data.get('question_id')),
                str(q_data.get('item_id')),
                q_data.get('item_title', ''),
                str(q_data.get('buyer_id', '')),
                q_data.get('buyer_nickname', ''),
                q_data.get('question_text', ''),
                q_data.get('answer_text'),
                q_data.get('ai_model_used', 'gemini-3.6-flash'),
                q_data.get('status', 'PENDING_APPROVAL'),
                q_data.get('auto_replied', False),
                q_data.get('response_time_ms', 0),
                q_data.get('error_message'),
                q_data.get('answered_at')
            ))
    return True


def get_meli_questions(limit=50, offset=0, status=None, search=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            query = "SELECT * FROM meli_questions WHERE 1=1"
            params = []
            if status:
                query += " AND status = %s"
                params.append(status)
            if search:
                query += " AND (question_text ILIKE %s OR item_title ILIKE %s OR buyer_nickname ILIKE %s OR item_id ILIKE %s)"
                s_param = f"%{search}%"
                params.extend([s_param, s_param, s_param, s_param])

            query += " ORDER BY id DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]


def get_meli_questions_count(status=None, search=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            query = "SELECT COUNT(*) as count FROM meli_questions WHERE 1=1"
            params = []
            if status:
                query += " AND status = %s"
                params.append(status)
            if search:
                query += " AND (question_text ILIKE %s OR item_title ILIKE %s OR buyer_nickname ILIKE %s OR item_id ILIKE %s)"
                s_param = f"%{search}%"
                params.extend([s_param, s_param, s_param, s_param])

            cursor.execute(query, tuple(params))
            row = cursor.fetchone()
            return row['count'] if row else 0


def get_meli_question_by_id(question_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM meli_questions WHERE question_id = %s", (str(question_id),))
            row = cursor.fetchone()
            return dict(row) if row else None


def update_meli_question_answer(question_id, answer_text, status='ANSWERED_AUTO', response_time_ms=0, ai_model_used='gemini-3.6-flash', error_message=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                UPDATE meli_questions
                SET answer_text = %s,
                    status = %s,
                    response_time_ms = %s,
                    ai_model_used = %s,
                    error_message = %s,
                    answered_at = CURRENT_TIMESTAMP
                WHERE question_id = %s
            ''', (answer_text, status, response_time_ms, ai_model_used, error_message, str(question_id)))
    return True


def get_meli_questions_stats():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN status LIKE 'ANSWERED%' THEN 1 END) as answered,
                    COUNT(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'ERROR' THEN 1 END) as failed,
                    COALESCE(AVG(CASE WHEN response_time_ms > 0 THEN response_time_ms END), 0) as avg_response_ms
                FROM meli_questions
            ''')
            row = cursor.fetchone()
            return dict(row) if row else {
                'total': 0, 'answered': 0, 'pending': 0, 'failed': 0, 'avg_response_ms': 0
            }








