from nicegui import ui
import pandas as pd
import plotly.graph_objects as go
from datetime import datetime

from src import database, meli_api

def create_dashboard_page():
    ui.label('Panel de Control').classes('text-3xl font-bold text-slate-100 mb-2')
    ui.label('Analiza el rendimiento de tus ventas en Mercado Libre, márgenes de ganancia y alertas de inventario.').classes('text-slate-400 mb-6')

    # Fetch stats from db
    stats = database.get_dashboard_metrics()
    
    # Grid of KPI Cards
    with ui.row().classes('w-full gap-6 items-stretch mb-6'):
        # 1. Total Revenue Card
        with ui.card().classes('flex-1 q-pa-lg glass-card gap-1 border-l-4 border-blue-500'):
            with ui.row().classes('w-full items-center justify-between'):
                ui.label('Facturación Total').classes('text-xs font-semibold text-slate-400 uppercase tracking-wider')
                ui.icon('monetization_on', size='sm').classes('text-blue-500')
            ui.label(f"${stats['total_revenue']:,.2f}").classes('text-2xl font-bold text-slate-100')
            ui.label('Ordenes aprobadas pagadas').classes('text-[10px] text-slate-500')

        # 2. Net Profit Card
        profit_color = 'emerald' if stats['total_profit'] >= 0 else 'red'
        with ui.card().classes('flex-1 q-pa-lg glass-card gap-1 border-l-4 border-emerald-500'):
            with ui.row().classes('w-full items-center justify-between'):
                ui.label('Ganancia Neta Est.').classes('text-xs font-semibold text-slate-400 uppercase tracking-wider')
                ui.icon('trending_up', size='sm').classes('text-emerald-500')
            ui.label(f"${stats['total_profit']:,.2f}").classes('text-2xl font-bold text-slate-100')
            ui.label(f"Margen Promedio: {stats['profit_margin']:.1f}%").classes(f'text-[10px] text-{profit_color}-400 font-semibold')

        # 3. Total Sales Count Card
        with ui.card().classes('flex-1 q-pa-lg glass-card gap-1 border-l-4 border-purple-500'):
            with ui.row().classes('w-full items-center justify-between'):
                ui.label('Órdenes concretadas').classes('text-xs font-semibold text-slate-400 uppercase tracking-wider')
                ui.icon('shopping_bag', size='sm').classes('text-purple-500')
            ui.label(f"{stats['total_sales']}").classes('text-2xl font-bold text-slate-100')
            ui.label('Ventas finalizadas').classes('text-[10px] text-slate-500')

        # 4. Low Stock alert card
        stock_color = 'red' if stats['low_stock_count'] > 0 else 'slate'
        stock_text_color = 'red' if stats['low_stock_count'] > 0 else 'slate-400'
        with ui.card().classes(f'flex-1 q-pa-lg glass-card gap-1 border-l-4 border-{stock_color}-500'):
            with ui.row().classes('w-full items-center justify-between'):
                ui.label('Alertas de Stock').classes('text-xs font-semibold text-slate-400 uppercase tracking-wider')
                ui.icon('warning', size='sm').classes(f'text-{stock_color}-500')
            ui.label(f"{stats['low_stock_count']}").classes(f'text-2xl font-bold text-{stock_text_color}')
            ui.label('Productos con 3 unidades o menos').classes('text-[10px] text-slate-500')

    # Draw Graphs using Plotly
    orders = database.get_all_orders()
    
    if not orders:
        with ui.card().classes('w-full q-pa-xl glass-card items-center justify-center text-slate-400 gap-2 mb-6'):
            ui.icon('query_stats', size='lg')
            ui.label('No hay datos suficientes para generar gráficos.').classes('text-sm')
            ui.label('Sincroniza tus datos de Mercado Libre para visualizar métricas en tiempo real.').classes('text-xs text-slate-500')
    else:
        # Prepare dataframes
        df_orders = pd.DataFrame([
            {
                'date': datetime.fromisoformat(o['date_created'].replace('Z', '+00:00')).strftime('%Y-%m-%d'),
                'amount': o['total_amount'],
                'status': o['status'],
                'items': o['items']
            }
            for o in orders
        ])

        with ui.row().classes('w-full gap-6 mb-6'):
            # Chart 1: Revenue trend
            with ui.card().classes('flex-1 q-pa-md glass-card'):
                ui.label('Tendencia de Facturación').classes('text-sm font-semibold text-slate-200 mb-2')
                
                # Group sales by date
                df_daily = df_orders[df_orders['status'] == 'paid'].groupby('date')['amount'].sum().reset_index()
                df_daily = df_daily.sort_values('date')
                
                fig_trend = go.Figure()
                fig_trend.add_trace(go.Bar(
                    x=df_daily['date'],
                    y=df_daily['amount'],
                    marker_color='#3B82F6',
                    name='Ingresos'
                ))
                
                fig_trend.update_layout(
                    margin=dict(l=40, r=20, t=10, b=40),
                    height=250,
                    plot_bgcolor='rgba(0,0,0,0)',
                    paper_bgcolor='rgba(0,0,0,0)',
                    font=dict(color='#94A3B8', size=10),
                    xaxis=dict(showgrid=False),
                    yaxis=dict(gridcolor='#334155'),
                )
                ui.plotly(fig_trend).classes('w-full h-64')

            # Chart 2: Top Products
            with ui.card().classes('flex-1 q-pa-md glass-card'):
                ui.label('Productos Más Vendidos (Cantidades)').classes('text-sm font-semibold text-slate-200 mb-2')
                
                # Unpack items to count quantity per product
                items_list = []
                for _, row in df_orders[df_orders['status'] == 'paid'].iterrows():
                    for item in row['items']:
                        items_list.append({
                            'title': item['title'],
                            'qty': item['quantity']
                        })
                
                if items_list:
                    df_items = pd.DataFrame(items_list).groupby('title')['qty'].sum().reset_index()
                    df_items = df_items.sort_values('qty', ascending=True).tail(5) # Top 5
                    
                    # Truncate long titles for neat graph
                    df_items['short_title'] = df_items['title'].apply(lambda x: x[:25] + '...' if len(x) > 25 else x)
                    
                    fig_prod = go.Figure()
                    fig_prod.add_trace(go.Bar(
                        x=df_items['qty'],
                        y=df_items['short_title'],
                        orientation='h',
                        marker_color='#10B981',
                        name='Cantidad Vendida'
                    ))
                    
                    fig_prod.update_layout(
                        margin=dict(l=150, r=20, t=10, b=40),
                        height=250,
                        plot_bgcolor='rgba(0,0,0,0)',
                        paper_bgcolor='rgba(0,0,0,0)',
                        font=dict(color='#94A3B8', size=10),
                        xaxis=dict(gridcolor='#334155'),
                        yaxis=dict(showgrid=False),
                    )
                    ui.plotly(fig_prod).classes('w-full h-64')
                else:
                    ui.label('No hay ventas registradas.').classes('text-xs text-slate-500')

    # Bottom Row: Stock Alert details and Quick Shortcuts
    with ui.row().classes('w-full gap-6 items-start'):
        # Left Panel: Low stock detail list
        with ui.card().classes('flex-1 q-pa-lg glass-card gap-4'):
            ui.label('Detalle de Alertas de Stock').classes('text-lg font-bold text-slate-100')
            
            low_stock_items = [p for p in database.get_all_products() if p['available_quantity'] <= 3 and p['status'] == 'active']
            
            if not low_stock_items:
                with ui.row().classes('w-full items-center gap-3 q-py-md text-emerald-500 justify-center'):
                    ui.icon('check_circle', size='md')
                    ui.label('Todo en orden. No hay alertas de stock bajo.').classes('text-sm font-semibold')
            else:
                with ui.column().classes('w-full gap-2'):
                    for item in low_stock_items:
                        with ui.row().classes('w-full items-center justify-between px-4 py-2.5 bg-red-500/5 border border-red-500/20 rounded-lg'):
                            with ui.column().classes('gap-0.5'):
                                ui.label(item['title']).classes('text-sm font-semibold text-slate-200 truncate max-w-[300px]')
                                ui.label(item['ml_id']).classes('text-xs text-slate-500 font-mono')
                            with ui.row().classes('items-center gap-4'):
                                with ui.row().classes('items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30'):
                                    ui.icon('warning', size='14px').classes('text-red-500')
                                    ui.label(f"{item['available_quantity']} uds").classes('text-xs font-bold text-red-500')
                                    
                                ui.button(icon='edit', on_click=lambda: ui.navigate.to('/inventory')).props('flat dense size=sm').classes('text-slate-400 hover:text-slate-200')
                                
        # Right Panel: Shortcuts and Stats
        with ui.card().classes('w-[350px] q-pa-lg glass-card gap-4'):
            ui.label('Acciones Rápidas').classes('text-lg font-bold text-slate-100')
            
            with ui.column().classes('w-full gap-2'):
                ui.button('Editar Precios y Stock', icon='edit', on_click=lambda: ui.navigate.to('/inventory')).classes('w-full bg-blue-600 hover:bg-blue-700 text-slate-100 py-2.5 rounded-lg text-sm font-semibold')
                ui.button('Ver Historial de Ventas', icon='receipt', on_click=lambda: ui.navigate.to('/sales')).classes('w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-lg text-sm font-semibold border border-slate-700')
                ui.button('Revisar Clientes', icon='people', on_click=lambda: ui.navigate.to('/customers')).classes('w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-lg text-sm font-semibold border border-slate-700')
