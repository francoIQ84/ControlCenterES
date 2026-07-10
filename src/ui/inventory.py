from nicegui import ui
from src import database, meli_api

def create_inventory_page():
    ui.label('Control de Inventario').classes('text-3xl font-bold text-slate-100 mb-2')
    ui.label('Edita los precios, stock y costos de tus productos. Guarda y sincroniza directamente con Mercado Libre.').classes('text-slate-400 mb-6')

    # Query & Filter State
    search_state = {'query': '', 'status': None}
    
    # Header card for controls
    with ui.card().classes('w-full q-pa-md glass-card mb-6'):
        with ui.row().classes('w-full items-center justify-between gap-4'):
            # Search input
            search_input = ui.input(placeholder='Buscar por título o ID...', on_change=lambda e: update_search(e.value)).classes('w-64').props('outlined dense dark')
            
            def on_status_change(e):
                search_state['status'] = None if e.value == 'all' else e.value
                refresh_list()
                
            # Status Filter select
            status_select = ui.select({
                'all': 'Todos los estados',
                'active': 'Activos',
                'paused': 'Pausados'
            }, value='all', on_change=on_status_change).classes('w-48').props('outlined dense dark')
            
            # Global Actions
            with ui.row().classes('gap-2'):
                async def sync_all():
                    n = ui.notification('Sincronizando catálogo con Mercado Libre...', type='ongoing', spinner=True)
                    ok, count = meli_api.sync_products()
                    if ok:
                        n.message = f"Sincronización exitosa. {count} productos actualizados."
                        n.spinner = False
                        n.icon = 'done'
                        n.type = 'positive'
                        refresh_list()
                    else:
                        n.message = f"Error al sincronizar: {count}"
                        n.spinner = False
                        n.icon = 'report_problem'
                        n.type = 'negative'
                
                ui.button('Sincronizar Catálogo', icon='sync', on_click=sync_all).classes('bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg')

    # Container for inventory items
    list_container = ui.column().classes('w-full gap-4')

    def update_search(val):
        search_state['query'] = val
        refresh_list()

    def refresh_list():
        list_container.clear()
        
        products = database.get_all_products(
            query=search_state['query'], 
            status_filter=search_state['status']
        )
        
        if not products:
            with list_container:
                with ui.card().classes('w-full q-pa-lg glass-card items-center justify-center text-slate-400 gap-2'):
                    ui.icon('inventory_2', size='lg')
                    ui.label('No se encontraron publicaciones en el caché local.').classes('text-sm')
                    ui.label('Haz clic en "Sincronizar Catálogo" para importar tus publicaciones.').classes('text-xs text-slate-500')
            return
            
        with list_container:
            # Header Row
            with ui.row().classes('w-full px-6 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-400 gap-4 items-center hide-on-mobile'):
                ui.label('Miniatura').classes('w-16 text-center')
                ui.label('Detalles del Producto').classes('flex-1')
                ui.label('Precio ($)').classes('w-32')
                ui.label('Stock').classes('w-24')
                ui.label('Costo ($)').classes('w-32')
                ui.label('Margen').classes('w-24 text-center')
                ui.label('Acciones').classes('w-36 text-center')

            # Render item cards
            for p in products:
                # Calculate margin percentage dynamically
                cost = p['cost_price'] or 0.0
                price = p['price']
                margin = ((price - cost) / price * 100) if price > 0 else 0.0
                margin_color = 'emerald' if margin > 20 else ('amber' if margin > 0 else 'red')

                # Create references to input bindings
                row_state = {
                    'price': price,
                    'qty': p['available_quantity'],
                    'cost': cost,
                    'margin_label': None  # Will reference label to update on the fly
                }

                # Helper to update margin label when price or cost changes
                def update_margin_display(rs):
                    c = rs['cost']
                    pr = rs['price']
                    m = ((pr - c) / pr * 100) if pr > 0 else 0.0
                    col = 'emerald' if m > 20 else ('amber' if m > 0 else 'red')
                    
                    # Update label
                    if rs['margin_label']:
                        rs['margin_label'].text = f"{m:.1f}%"
                        # Set colors dynamically by clearing classes
                        rs['margin_label'].classes(replace=f'text-xs font-bold text-{col}-500')

                with ui.card().classes('w-full q-pa-sm glass-card hover:border-slate-700 transition-colors duration-200'):
                    with ui.row().classes('w-full items-center gap-4 q-py-xs px-2'):
                        
                        # Thumbnail
                        with ui.avatar(square=True).classes('bg-slate-800 rounded-lg overflow-hidden'):
                            ui.image(p['thumbnail'] or 'https://http2.mlstatic.com/D_NQ_NP_900015-MLA45678912345_032021-O.webp').classes('w-full h-full object-contain')
                            
                        # Details
                        with ui.column().classes('flex-1 gap-0.5 min-w-[200px]'):
                            ui.label(p['title']).classes('text-sm font-semibold text-slate-100 truncate w-full')
                            with ui.row().classes('items-center gap-2'):
                                ui.label(p['ml_id']).classes('text-xs text-slate-500 font-mono')
                                
                                # Status badge
                                is_active = p['status'] == 'active'
                                status_color = 'emerald' if is_active else 'amber'
                                ui.label(p['status'].upper()).classes(f'text-[10px] px-1.5 py-0.5 rounded bg-{status_color}-500/10 text-{status_color}-400 font-semibold border border-{status_color}-500/20')

                        def make_on_price_change(rs):
                            def on_price_change(e):
                                rs['price'] = e.value or 0.0
                                update_margin_display(rs)
                            return on_price_change

                        # Price Input
                        p_input = ui.number(value=price, format='%.2f', on_change=make_on_price_change(row_state)).classes('w-32').props('outlined dense dark')

                        def make_on_qty_change(rs):
                            def on_qty_change(e):
                                rs['qty'] = int(e.value or 0)
                            return on_qty_change

                        # Stock Input
                        s_input = ui.number(value=p['available_quantity'], format='%d', on_change=make_on_qty_change(row_state)).classes('w-24').props('outlined dense dark')

                        def make_on_cost_change(rs):
                            def on_cost_change(e):
                                rs['cost'] = e.value or 0.0
                                update_margin_display(rs)
                            return on_cost_change

                        # Cost Price Input (saved locally, doesn't sync to Mercado Libre)
                        c_input = ui.number(value=cost, format='%.2f', on_change=make_on_cost_change(row_state)).classes('w-32').props('outlined dense dark')

                        # Margen Indicator (calculated)
                        with ui.column().classes('w-24 items-center justify-center gap-0.5'):
                            row_state['margin_label'] = ui.label(f"{margin:.1f}%").classes(f'text-xs font-bold text-{margin_color}-500')
                            ui.label('margen est.').classes('text-[9px] text-slate-500')

                        # Action Buttons
                        with ui.row().classes('w-36 justify-center gap-1'):
                            # Local Save (always saves cost to DB)
                            async def save_row(item_id=p['ml_id'], rs=row_state):
                                # Update locally first
                                database.update_product_cost(item_id, rs['cost'])
                                database.update_product_stock_price(item_id, rs['qty'], rs['price'])
                                
                                # Send updates to Mercado Libre API
                                n = ui.notification('Actualizando en Mercado Libre...', type='ongoing', spinner=True)
                                ok, msg = meli_api.update_stock_and_price(item_id, rs['qty'], rs['price'])
                                if ok:
                                    n.message = "¡Guardado y Sincronizado!"
                                    n.spinner = False
                                    n.icon = 'check_circle'
                                    n.type = 'positive'
                                    update_margin_display(rs)
                                else:
                                    n.message = f"Error al sincronizar: {msg}"
                                    n.spinner = False
                                    n.icon = 'error'
                                    n.type = 'negative'
                            
                            ui.button(icon='cloud_done', on_click=save_row).props('flat dense').classes('text-blue-500 hover:bg-blue-500/10 rounded')
                            
                            # Open link
                            if p['permalink']:
                                ui.button(icon='open_in_new', on_click=lambda url=p['permalink']: ui.navigate.to(url, new_tab=True)).props('flat dense').classes('text-slate-400 hover:text-slate-200 rounded')

    # Initial load of listing
    refresh_list()
