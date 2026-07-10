import os
import sqlite3
import json
from datetime import datetime

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
DB_PATH = os.path.join(DB_DIR, 'control_center.db')

def init_db():
    """Initializes the SQLite database and creates the necessary tables if they don't exist."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Settings table (key-value)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    # Products cache table (with custom local fields like cost_price)
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
            last_sync TEXT
        )
    ''')

    # Orders cache table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders_cache (
            order_id INTEGER PRIMARY KEY,
            date_created TEXT,
            buyer_id INTEGER,
            buyer_nickname TEXT,
            buyer_name TEXT,
            total_amount REAL,
            currency_id TEXT,
            status TEXT,
            payment_status TEXT,
            shipping_status TEXT,
            items_json TEXT,
            invoice_generated INTEGER DEFAULT 0
        )
    ''')

    # Customers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            buyer_id INTEGER PRIMARY KEY,
            nickname TEXT,
            full_name TEXT,
            email TEXT,
            phone TEXT,
            document_type TEXT,
            document_number TEXT
        )
    ''')

    conn.commit()
    conn.close()

def get_connection():
    """Returns a sqlite3 connection to the database."""
    init_db()  # Ensure DB is initialized
    return sqlite3.connect(DB_PATH)

# --- Settings Operations ---

def get_setting(key, default=None):
    """Retrieves a setting value from the database."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else default

def set_setting(key, value):
    """Saves or updates a setting in the database."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()

def delete_setting(key):
    """Deletes a setting from the database."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM settings WHERE key = ?", (key,))
    conn.commit()
    conn.close()

# --- Products Operations ---

def save_products(products_list):
    """Saves or updates a list of products in the cache, preserving local cost_price if it exists."""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    for p in products_list:
        # Check if cost_price already exists for this ml_id to avoid overwriting it
        cursor.execute("SELECT cost_price FROM products_cache WHERE ml_id = ?", (p['ml_id'],))
        row = cursor.fetchone()
        cost_price = row[0] if row else 0.0

        cursor.execute('''
            INSERT OR REPLACE INTO products_cache 
            (ml_id, title, price, available_quantity, cost_price, permalink, thumbnail, status, last_sync)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (p['ml_id'], p['title'], p['price'], p['available_quantity'], cost_price, 
              p.get('permalink'), p.get('thumbnail'), p.get('status'), now))
    conn.commit()
    conn.close()

def update_product_cost(ml_id, cost_price):
    """Updates the local cost price of a product."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE products_cache SET cost_price = ? WHERE ml_id = ?", (cost_price, ml_id))
    conn.commit()
    conn.close()

def update_product_stock_price(ml_id, quantity, price):
    """Updates the cached stock and price of a product."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE products_cache SET available_quantity = ?, price = ? WHERE ml_id = ?", (quantity, price, ml_id))
    conn.commit()
    conn.close()

def get_all_products(query=None, status_filter=None):
    """Retrieves cached products from the database with optional search and filter."""
    conn = get_connection()
    cursor = conn.cursor()
    
    sql = "SELECT ml_id, title, price, available_quantity, cost_price, permalink, thumbnail, status, last_sync FROM products_cache WHERE 1=1"
    params = []
    
    if query:
        sql += " AND (title LIKE ? OR ml_id LIKE ?)"
        params.extend([f"%{query}%", f"%{query}%"])
        
    if status_filter:
        sql += " AND status = ?"
        params.append(status_filter)
        
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()
    
    products = []
    for r in rows:
        products.append({
            'ml_id': r[0],
            'title': r[1],
            'price': r[2],
            'available_quantity': r[3],
            'cost_price': r[4],
            'permalink': r[5],
            'thumbnail': r[6],
            'status': r[7],
            'last_sync': r[8]
        })
    return products

# --- Orders & Customers Operations ---

def save_orders_and_customers(orders_list):
    """Saves a list of orders and extracts customer information from them."""
    conn = get_connection()
    cursor = conn.cursor()
    
    for o in orders_list:
        # Save order
        cursor.execute('''
            INSERT OR REPLACE INTO orders_cache 
            (order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT invoice_generated FROM orders_cache WHERE order_id = ?), 0))
        ''', (
            o['order_id'], o['date_created'], o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
            o['total_amount'], o['currency_id'], o['status'], o['payment_status'], o['shipping_status'],
            json.dumps(o['items']), o['order_id']
        ))
        
        # Save customer
        cursor.execute('''
            INSERT OR REPLACE INTO customers 
            (buyer_id, nickname, full_name, email, phone, document_type, document_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            o['buyer']['id'], o['buyer']['nickname'], o['buyer']['name'],
            o['buyer'].get('email'), o['buyer'].get('phone'),
            o['buyer'].get('document_type'), o['buyer'].get('document_number')
        ))
        
    conn.commit()
    conn.close()

def update_order_invoice_status(order_id, status=1):
    """Marks an order invoice as generated."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders_cache SET invoice_generated = ? WHERE order_id = ?", (status, order_id))
    conn.commit()
    conn.close()

def get_all_orders():
    """Retrieves all cached orders."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT order_id, date_created, buyer_id, buyer_nickname, buyer_name, total_amount, currency_id, status, payment_status, shipping_status, items_json, invoice_generated FROM orders_cache ORDER BY date_created DESC")
    rows = cursor.fetchall()
    conn.close()
    
    orders = []
    for r in rows:
        orders.append({
            'order_id': r[0],
            'date_created': r[1],
            'buyer': {
                'id': r[2],
                'nickname': r[3],
                'name': r[4]
            },
            'total_amount': r[5],
            'currency_id': r[6],
            'status': r[7],
            'payment_status': r[8],
            'shipping_status': r[9],
            'items': json.loads(r[10]),
            'invoice_generated': bool(r[11])
        })
    return orders

def get_all_customers():
    """Retrieves all customers with their purchase statistics (total spent and order count)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT 
            c.buyer_id, c.nickname, c.full_name, c.email, c.phone, c.document_type, c.document_number,
            COUNT(o.order_id) as total_orders,
            SUM(o.total_amount) as total_spent
        FROM customers c
        LEFT JOIN orders_cache o ON c.buyer_id = o.buyer_id
        GROUP BY c.buyer_id
        ORDER BY total_spent DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    
    customers = []
    for r in rows:
        customers.append({
            'buyer_id': r[0],
            'nickname': r[1],
            'full_name': r[2],
            'email': r[3],
            'phone': r[4],
            'document_type': r[5],
            'document_number': r[6],
            'total_orders': r[7] or 0,
            'total_spent': r[8] or 0.0
        })
    return customers

# --- Metrics Operations ---

def get_dashboard_metrics():
    """Calculates overall metrics from cached orders and products."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Total Sales and revenue
    cursor.execute("SELECT COUNT(order_id), SUM(total_amount) FROM orders_cache WHERE status = 'paid'")
    sales_row = cursor.fetchone()
    total_sales = sales_row[0] or 0
    total_revenue = sales_row[1] or 0.0
    
    # 2. Total active products
    cursor.execute("SELECT COUNT(ml_id) FROM products_cache WHERE status = 'active'")
    total_active_products = cursor.fetchone()[0] or 0
    
    # 3. Calculate profit margin
    # To do this, we need to iterate over all items in paid orders, match with cost_price from products_cache.
    cursor.execute("SELECT items_json FROM orders_cache WHERE status = 'paid'")
    orders_items = cursor.fetchall()
    
    # Pre-fetch all cost prices for calculation
    cursor.execute("SELECT ml_id, cost_price FROM products_cache")
    costs = dict(cursor.fetchall())
    
    total_cost = 0.0
    for row in orders_items:
        items = json.loads(row[0])
        for item in items:
            ml_id = item.get('id')
            quantity = item.get('quantity', 1)
            cost = costs.get(ml_id, 0.0)
            total_cost += cost * quantity
            
    total_profit = total_revenue - total_cost
    profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0.0
    
    # 4. Low stock count
    cursor.execute("SELECT COUNT(ml_id) FROM products_cache WHERE available_quantity <= 3 AND status = 'active'")
    low_stock_count = cursor.fetchone()[0] or 0
    
    conn.close()
    
    return {
        'total_sales': total_sales,
        'total_revenue': total_revenue,
        'total_active_products': total_active_products,
        'total_profit': total_profit,
        'profit_margin': profit_margin,
        'low_stock_count': low_stock_count
    }
