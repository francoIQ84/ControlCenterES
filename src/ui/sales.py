from nicegui import ui
from src import database, meli_api
from src.utils import invoice_gen
from datetime import datetime, timedelta

def create_sales_page():
    ui.label('Control de Ventas').classes('text-3xl font-bold text-slate-100 mb-2')
    ui.label('Consulta las ventas entrantes de Mercado Libre y genera comprobantes de facturación comercial.').classes('text-slate-400 mb-6')

    # Search query state
    search_query = {'val': ''}

    def on_search(e):
        search_query['val'] = e.value.lower() if e.value else ''
        refresh_sales()

    # Control Bar
    with ui.card().classes('w-full q-pa-md glass-card mb-6'):
        with ui.row().classes('w-full items-center justify-between gap-4'):
            search_input = ui.input(placeholder='Buscar por comprador, ID o producto...', on_change=on_search).classes('w-80').props('outlined dense dark')
            
            with ui.row().classes('items-center gap-4'):
                time_range_select = ui.select({
                    '18m': 'Últimos 18 meses',
                    '12m': 'Últimos 12 meses',
                    '6m': 'Últimos 6 meses',
                    '1m': 'Último mes',
                    '1w': 'Última semana'
                }, value='18m', label='Período').classes('w-48').props('outlined dense')
                
                limit_input = ui.number(label='Máx. Resultados', value=2000, min=1, max=5000, format='%.0f').classes('w-32').props('outlined dense')
                
                async def sync_sales():
                    sync_btn.disable()
                    sync_btn.text = 'Actualizando...'
                    sync_btn.icon = 'hourglass_bottom'
                    n = ui.notification('Buscando ventas...', type='ongoing', spinner=True)
                    limit_val = int(limit_input.value or 2000)
                    
                    # Calcular fecha en base al selector
                    now = datetime.utcnow()
                    days = 540 # default 18m
                    val = time_range_select.value
                    if val == '18m': days = 540
                    elif val == '12m': days = 365
                    elif val == '6m': days = 180
                    elif val == '1m': days = 30
                    elif val == '1w': days = 7
                    
                    d_from_dt = now - timedelta(days=days)
                    d_from = d_from_dt.strftime('%Y-%m-%dT00:00:00.000-00:00')
                    d_to = None # Hasta la actualidad
                    
                    ok, count = meli_api.sync_orders(limit=limit_val, date_from=d_from, date_to=d_to)
                    if ok:
                        n.message = f"Ventas actualizadas. {count} órdenes procesadas."
                        n.spinner = False
                        n.icon = 'done'
                        n.type = 'positive'
                        refresh_sales()
                    else:
                        n.message = f"Error al actualizar ventas: {count}"
                        n.spinner = False
                        n.icon = 'error'
                        n.type = 'negative'
                        
                    sync_btn.enable()
                    sync_btn.text = 'Actualizar Ventas'
                    sync_btn.icon = 'sync_alt'
                        
                sync_btn = ui.button('Actualizar Ventas', icon='sync_alt', on_click=sync_sales).classes('bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg')

    sales_container = ui.column().classes('w-full gap-4')

    def refresh_sales():
        sales_container.clear()
        
        orders = database.get_all_orders()
        query = search_query['val']
        
        # Filter manually if query is set
        if query:
            filtered_orders = []
            for o in orders:
                buyer_name = o['buyer']['name'].lower()
                buyer_nick = o['buyer']['nickname'].lower()
                order_id_str = str(o['order_id'])
                items_str = " ".join([i['title'].lower() for i in o['items']])
                
                if query in buyer_name or query in buyer_nick or query in order_id_str or query in items_str:
                    filtered_orders.append(o)
            orders = filtered_orders

        if not orders:
            with sales_container:
                with ui.card().classes('w-full q-pa-lg glass-card items-center justify-center text-slate-400 gap-2'):
                    ui.icon('shopping_cart', size='lg')
                    ui.label('No hay ventas registradas en el caché local.').classes('text-sm')
                    ui.label('Haz clic en "Actualizar Ventas" para obtener las transacciones de Mercado Libre.').classes('text-xs text-slate-500')
            return

        with sales_container:
            # Header Row
            with ui.row().classes('w-full px-6 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-400 gap-4 items-center hide-on-mobile'):
                ui.label('ID Venta / Fecha').classes('w-36')
                ui.label('Comprador').classes('w-44')
                ui.label('Productos').classes('flex-1')
                ui.label('Total').classes('w-28')
                ui.label('Estado Envío').classes('w-28 text-center')
                ui.label('Factura').classes('w-32 text-center')

            # Rows
            for o in orders:
                order_date = datetime.fromisoformat(o['date_created'].replace('Z', '+00:00'))
                date_str = order_date.strftime("%d/%m/%Y %H:%M")
                
                with ui.card().classes('w-full q-pa-sm glass-card hover:border-slate-700 transition-colors duration-200'):
                    with ui.row().classes('w-full items-center gap-4 q-py-xs px-2'):
                        
                        # ID & Date
                        with ui.column().classes('w-36 gap-0.5'):
                            ui.label(f"#{o['order_id']}").classes('text-xs font-bold text-slate-100 font-mono')
                            ui.label(date_str).classes('text-[10px] text-slate-500')
                            
                        # Buyer Info
                        with ui.column().classes('w-44 gap-0.5'):
                            ui.label(o['buyer']['name']).classes('text-sm font-semibold text-slate-100 truncate w-full')
                            ui.label(f"@{o['buyer']['nickname']}").classes('text-[11px] text-slate-500 font-mono')
                            
                        # Items ordered
                        with ui.column().classes('flex-1 gap-1'):
                            for item in o['items']:
                                ui.label(f"{item['quantity']}x {item['title']}").classes('text-xs text-slate-300 truncate w-full')
                                
                        # Total price
                        ui.label(f"${o['total_amount']:,.2f}").classes('w-28 text-sm font-bold text-slate-100')
                        
                        # Shipping Status badge
                        ship_status = o['shipping_status']
                        ship_colors = {
                            'delivered': ('emerald', 'Entregado'),
                            'shipped': ('blue', 'En Camino'),
                            'pending': ('amber', 'Pendiente'),
                            'cancelled': ('red', 'Cancelado')
                        }
                        color, text = ship_colors.get(ship_status, ('slate', ship_status))
                        
                        with ui.column().classes('w-28 items-center justify-center'):
                            ui.label(text.upper()).classes(f'text-[10px] px-2 py-0.5 rounded bg-{color}-500/10 text-{color}-400 font-bold border border-{color}-500/20')
                        
                        # Invoice controls
                        with ui.column().classes('w-32 items-center justify-center'):
                            invoice_state = {'generated': o['invoice_generated']}
                            
                            # Container so we can swap buttons reactively
                            btn_container = ui.row()
                            
                            def make_invoice_action(order_data=o, container=btn_container, state=invoice_state):
                                def draw_buttons():
                                    container.clear()
                                    with container:
                                        if state['generated']:
                                            # View Button
                                            pdf_url = f"/invoices/factura_{order_data['order_id']}.pdf"
                                            ui.button(
                                                'Ver PDF', 
                                                icon='picture_as_pdf', 
                                                on_click=lambda url=pdf_url: ui.navigate.to(url, new_tab=True)
                                            ).props('dense outline size=sm color=positive').classes('text-xs font-semibold px-2 py-1 rounded')
                                        else:
                                            # Generate Button
                                            async def generate():
                                                n = ui.notification('Generando factura PDF...', type='ongoing', spinner=True)
                                                try:
                                                    invoice_gen.generate_invoice_pdf(order_data)
                                                    n.message = "¡Factura generada con éxito!"
                                                    n.spinner = False
                                                    n.icon = 'done'
                                                    n.type = 'positive'
                                                    
                                                    # Update button display state
                                                    state['generated'] = True
                                                    draw_buttons()
                                                    
                                                    # Auto open
                                                    pdf_url = f"/invoices/factura_{order_data['order_id']}.pdf"
                                                    ui.navigate.to(pdf_url, new_tab=True)
                                                except Exception as e:
                                                    n.message = f"Error al generar: {str(e)}"
                                                    n.spinner = False
                                                    n.icon = 'report_problem'
                                                    n.type = 'negative'
                                                    
                                            ui.button(
                                                'Facturar', 
                                                icon='receipt', 
                                                on_click=generate
                                            ).props('dense color=primary size=sm').classes('text-xs font-semibold px-2 py-1 rounded text-white')
                                            
                                draw_buttons()
                            
                            make_invoice_action()

    # Run initial display load
    refresh_sales()
