import os
from nicegui import ui, app

# Initialize database
from src import database, meli_api

database.init_db()

# Create invoices directory and mount static files route
os.makedirs('invoices', exist_ok=True)
app.add_static_files('/invoices', 'invoices')

# Seed mock data if database is empty and demo mode is enabled
if database.get_setting('demo_mode', '1') == '1':
    # Check if we already have products
    products = database.get_all_products()
    if not products:
        print("Seeding initial demo products and sales orders...")
        meli_api.sync_products()
        meli_api.sync_orders()

# Import page builders
from src.ui.theme import page_frame
from src.ui.dashboard import create_dashboard_page
from src.ui.inventory import create_inventory_page
from src.ui.sales import create_sales_page
from src.ui.customers import create_customers_page
from src.ui.settings import create_settings_page

# Define page routes
@ui.page('/')
def page_dashboard():
    with page_frame('Dashboard'):
        create_dashboard_page()

@ui.page('/inventory')
def page_inventory():
    with page_frame('Inventario'):
        create_inventory_page()

@ui.page('/sales')
def page_sales():
    with page_frame('Ventas'):
        create_sales_page()

@ui.page('/customers')
def page_customers():
    with page_frame('Clientes'):
        create_customers_page()

@ui.page('/settings')
def page_settings():
    with page_frame('Configuración'):
        create_settings_page()

# Start application
if __name__ in {"__main__", "__mp_main__"}:
    # In Windows, multi-processing can cause __mp_main__ imports, 
    # check standard __main__ to avoid multiple starts.
    from src.utils.ssl_gen import ensure_ssl_certs
    cert_path, key_path = ensure_ssl_certs()
    
    ui.run(
        port=8088,
        title="ControlCenterES - Gestor Mercado Libre",
        favicon="📊",
        ssl_certfile=cert_path,
        ssl_keyfile=key_path
    )
