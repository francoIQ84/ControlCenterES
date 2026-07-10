from contextlib import contextmanager
from nicegui import ui
from src import database, meli_api

# Define color constants (Premium dark slate and blue accents)
BG_PAGE = "#0F172A"       # Tailwind slate-900
BG_CARD = "#1E293B"       # Tailwind slate-800
ACCENT_PRIMARY = "#3B82F6"  # Tailwind blue-500
ACCENT_SUCCESS = "#10B981"  # Tailwind emerald-500
ACCENT_WARNING = "#F59E0B"  # Tailwind amber-500
ACCENT_DANGER = "#EF4444"   # Tailwind red-500

def init_theme():
    """Initializes global HTML heads, custom fonts, and styling."""
    ui.add_head_html('''
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Outfit', sans-serif;
                background-color: #0F172A !important;
                color: #F8FAFC !important;
            }
            .glass-card {
                background: rgba(30, 41, 59, 0.7) !important;
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 12px;
            }
            .sidebar-item:hover {
                background: rgba(59, 130, 246, 0.1);
                border-left: 4px solid #3B82F6;
            }
            .sidebar-item-active {
                background: rgba(59, 130, 246, 0.15) !important;
                border-left: 4px solid #3B82F6 !important;
                font-weight: 600;
            }
            /* Custom Scrollbar */
            ::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            ::-webkit-scrollbar-track {
                background: #0F172A;
            }
            ::-webkit-scrollbar-thumb {
                background: #334155;
                border-radius: 4px;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: #475569;
            }
        </style>
    ''')
    # Default to dark mode for a premium tech look
    ui.dark_mode().enable()

def get_connection_status():
    """Determines connection state and returns status text, color, and icon."""
    demo = meli_api.is_demo_mode()
    if demo:
        return "Modo Demo Activo", "amber", "bolt"
    
    auth = database.get_setting('access_token')
    if auth:
        nickname = database.get_setting('user_nickname', 'Vendedor ML')
        return f"Conectado: {nickname}", "emerald", "cloud_done"
        
    return "Desconectado", "red", "cloud_off"

@contextmanager
def page_frame(active_page: str):
    """
    Layout frame for all pages.
    Provides a beautiful sidebar navigation and top status bar.
    """
    init_theme()
    
    with ui.header(elevated=False).classes('q-py-md px-6 bg-slate-900 border-b border-slate-800 justify-between items-center'):
        # Brand logo
        with ui.row().classes('items-center gap-3'):
            ui.icon('space_dashboard', size='md').classes('text-blue-500')
            ui.label('ControlCenterES').classes('text-xl font-bold tracking-wider text-slate-100')
            
        # Top right: Status badge, Sync Button, Theme Toggle
        with ui.row().classes('items-center gap-4'):
            status_text, color, icon = get_connection_status()
            with ui.row().classes(f'items-center px-3 py-1.5 rounded-full bg-{color}-500/10 border border-{color}-500/30 gap-2'):
                ui.icon(icon, size='18px').classes(f'text-{color}-500')
                ui.label(status_text).classes(f'text-xs font-semibold text-{color}-400')
                
            # Quick Sync
            async def run_sync():
                n = ui.notification('Iniciando sincronización...', type='ongoing', spinner=True)
                try:
                    p_ok, p_count = meli_api.sync_products()
                    o_ok, o_count = meli_api.sync_orders()
                    if p_ok and o_ok:
                        n.message = f"Sincronización completa. {p_count} prod, {o_count} ventas."
                        n.icon = 'done'
                        n.spinner = False
                        n.type = 'positive'
                        ui.navigate.to(ui.navigate.current_path)  # Refresh current page
                    else:
                        n.message = "Error al sincronizar con Mercado Libre."
                        n.icon = 'report_problem'
                        n.spinner = False
                        n.type = 'negative'
                except Exception as e:
                    n.message = f"Error: {str(e)}"
                    n.icon = 'report_problem'
                    n.spinner = False
                    n.type = 'negative'
                    
            ui.button(icon='refresh', on_click=run_sync).props('flat round dense').classes('text-slate-400 hover:text-slate-100')
            
            # Simple Dark/Light mode toggle
            dark = ui.dark_mode()
            ui.button(icon='dark_mode', on_click=dark.toggle).props('flat round dense').classes('text-slate-400 hover:text-slate-100')

    # Sidebar Left
    with ui.left_drawer(value=True, bordered=False).classes('bg-slate-900 border-r border-slate-800 p-0 q-pa-none'):
        with ui.column().classes('w-full gap-1 pt-6'):
            # Navigation Items
            nav_items = [
                ('Dashboard', 'dashboard', '/'),
                ('Inventario', 'inventory_2', '/inventory'),
                ('Ventas', 'shopping_cart', '/sales'),
                ('Clientes', 'people', '/customers'),
                ('Configuración', 'settings', '/settings')
            ]
            
            for name, icon, path in nav_items:
                is_active = active_page == name
                item_class = 'sidebar-item-active text-blue-400' if is_active else 'text-slate-400 hover:text-slate-200'
                
                with ui.link(target=path).classes('w-full text-decoration-none'):
                    with ui.row().classes(f'w-full py-4 px-6 items-center gap-4 sidebar-item {item_class} cursor-pointer'):
                        ui.icon(icon, size='sm')
                        ui.label(name).classes('text-sm font-medium tracking-wide')

    # Main Content Area
    with ui.column().classes('w-full min-h-screen bg-slate-950 p-8 gap-6'):
        yield
