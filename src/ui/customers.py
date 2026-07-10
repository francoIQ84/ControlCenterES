from nicegui import ui
from src import database

def create_customers_page():
    ui.label('Directorio de Clientes').classes('text-3xl font-bold text-slate-100 mb-2')
    ui.label('Listado unificado de compradores con historial de ventas acumulado y datos de contacto.').classes('text-slate-400 mb-6')

    # Search Query
    search_query = {'val': ''}

    def on_search(e):
        search_query['val'] = e.value.lower() if e.value else ''
        refresh_customers()

    # Control Bar
    with ui.card().classes('w-full q-pa-md glass-card mb-6'):
        search_input = ui.input(placeholder='Buscar por nombre, usuario o email...', on_change=on_search).classes('w-80').props('outlined dense dark')

    customers_container = ui.column().classes('w-full gap-4')

    def refresh_customers():
        customers_container.clear()
        
        customers = database.get_all_customers()
        query = search_query['val']
        
        if query:
            filtered = []
            for c in customers:
                name = c['full_name'].lower() if c['full_name'] else ''
                nick = c['nickname'].lower() if c['nickname'] else ''
                email = c['email'].lower() if c['email'] else ''
                
                if query in name or query in nick or query in email:
                    filtered.append(c)
            customers = filtered

        if not customers:
            with customers_container:
                with ui.card().classes('w-full q-pa-lg glass-card items-center justify-center text-slate-400 gap-2'):
                    ui.icon('people', size='lg')
                    ui.label('No hay clientes registrados en la base de datos local.').classes('text-sm')
                    ui.label('Las ventas importadas de Mercado Libre rellenarán este listado automáticamente.').classes('text-xs text-slate-500')
            return

        with customers_container:
            # Header Row
            with ui.row().classes('w-full px-6 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-400 gap-4 items-center hide-on-mobile'):
                ui.label('Comprador').classes('flex-1')
                ui.label('Documento').classes('w-36')
                ui.label('Email / Teléfono').classes('w-64')
                ui.label('Compras Realizadas').classes('w-36 text-center')
                ui.label('Monto Acumulado').classes('w-36 text-right')

            # Render customer rows
            for c in customers:
                doc_str = f"{c['document_type'] or 'DNI'}: {c['document_number']}" if c['document_number'] else 'No registrado'
                
                with ui.card().classes('w-full q-pa-sm glass-card hover:border-slate-700 transition-colors duration-200'):
                    with ui.row().classes('w-full items-center gap-4 q-py-xs px-2'):
                        
                        # Full Name / Nickname
                        with ui.column().classes('flex-1 gap-0.5 min-w-[200px]'):
                            ui.label(c['full_name'] or 'Comprador Meli').classes('text-sm font-semibold text-slate-100')
                            ui.label(f"@{c['nickname']}").classes('text-xs text-slate-500 font-mono')
                            
                        # Document details
                        ui.label(doc_str).classes('w-36 text-xs text-slate-300 font-mono')
                        
                        # Contact info
                        with ui.column().classes('w-64 gap-0.5'):
                            ui.label(c['email'] or '-').classes('text-xs text-slate-300 truncate w-full')
                            ui.label(c['phone'] or '-').classes('text-xs text-slate-500 font-mono')
                            
                        # Orders Count
                        with ui.row().classes('w-36 justify-center'):
                            ui.label(str(c['total_orders'])).classes('text-sm font-semibold text-slate-100')
                            
                        # Total spent
                        ui.label(f"${c['total_spent']:,.2f}").classes('w-36 text-right text-sm font-bold text-blue-400')

    # Initial load of listing
    refresh_customers()
