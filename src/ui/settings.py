from nicegui import ui, app
from fastapi.responses import RedirectResponse
import urllib.parse
from src import config, database, meli_api

# Define custom callback endpoint on the FastAPI app instance
@app.get('/meli_callback')
def meli_callback(code: str = None, error: str = None):
    if error:
        return RedirectResponse('/settings?status=error&msg=Autorizacion_cancelada')
        
    if code:
        ok, msg = meli_api.authenticate_with_code(code)
        if ok:
            # Sincronizar info del usuario
            # En demo mode o real, obtenemos datos
            meli_api.sync_products()
            meli_api.sync_orders()
            return RedirectResponse('/settings?status=success')
        else:
            safe_msg = urllib.parse.quote(msg)
            return RedirectResponse(f'/settings?status=error&msg={safe_msg}')
            
    return RedirectResponse('/settings')

def create_settings_page():
    # Parse query parameters from URL for success/error alerts
    # NiceGUI allows accessing page parameters, but since we are generating pages reactively, 
    # we can check URL or display notifications accordingly.
    
    # Let's define the UI contents
    ui.label('Configuración del Sistema').classes('text-3xl font-bold text-slate-100 mb-2')
    ui.label('Vincula tu cuenta de Mercado Libre y edita la información de facturación comercial.').classes('text-slate-400 mb-6')
    
    # Demo Mode Card
    with ui.card().classes('w-full q-pa-md glass-card mb-6'):
        with ui.row().classes('w-full items-center justify-between'):
            with ui.column().classes('gap-1'):
                ui.label('Modo Demostración / Sandbox').classes('text-lg font-semibold text-slate-100')
                ui.label('Usa el sistema con datos simulados sin conectar una cuenta real de Mercado Libre.').classes('text-xs text-slate-400')
            
            async def toggle_demo(e):
                is_active = e.value
                val = '1' if is_active else '0'
                database.set_setting('demo_mode', val)
                
                # Clear cached products, orders, and customers
                database.clear_all_caches()
                
                if is_active:
                    ui.notify('Modo Demo activado. Se usarán datos de simulación.', type='warning')
                    # Pre-populate mock cache
                    meli_api.sync_products()
                    meli_api.sync_orders()
                else:
                    # Clear access token to force clean authentication in real mode
                    database.delete_setting('access_token')
                    database.delete_setting('refresh_token')
                    database.delete_setting('user_id')
                    database.delete_setting('user_nickname')
                    ui.notify('Modo Real activado y datos de simulación eliminados. Por favor, vincula tu cuenta.', type='info')
                ui.navigate.to('/settings')

            is_demo = database.get_setting('demo_mode', '1') == '1'
            demo_switch = ui.switch('Demo Mode', value=is_demo, on_change=toggle_demo).classes('text-slate-100')

    with ui.row().classes('w-full gap-6 items-start'):
        # Left Panel: Mercado Libre Integration
        with ui.card().classes('flex-1 q-pa-lg glass-card gap-4'):
            ui.label('1. Integración con Mercado Libre').classes('text-xl font-bold text-blue-400 mb-2')
            
            # Show credentials fields
            client_id_input = ui.input('Client ID (APP ID)', value=config.get_client_id()).classes('w-full').props('outlined dense dark')
            client_secret_input = ui.input('Client Secret (Secret Key)', value=config.get_client_secret()).classes('w-full').props('outlined dense password dark')
            
            # Country dropdown
            country_options = {k: v['name'] for k, v in config.COUNTRIES.items()}
            country_dropdown = ui.select(country_options, label='País de Operación', value=config.get_country()).classes('w-full').props('outlined dense dark')
            
            redirect_uri_input = ui.input('Redirect URI', value=config.get_redirect_uri()).classes('w-full').props('outlined dense dark')
            
            def save_credentials():
                config.set_client_id(client_id_input.value.strip())
                config.set_client_secret(client_secret_input.value.strip())
                config.set_country(country_dropdown.value)
                config.set_redirect_uri(redirect_uri_input.value.strip())
                ui.notify('Credenciales de API guardadas con éxito.', type='positive')
                ui.navigate.to('/settings')
                
            ui.button('Guardar Credenciales', on_click=save_credentials).classes('w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg')
            
            ui.separator().classes('my-2 border-slate-700')
            
            # Connect Button
            status_text, color, icon = theme.get_connection_status()
            with ui.column().classes('w-full items-center gap-2 mt-2'):
                ui.label(f"Estado de Conexión: {status_text}").classes('text-sm text-slate-300 font-medium')
                
                def connect_meli():
                    if not config.get_client_id() or not config.get_client_secret():
                        ui.notify('Primero debes guardar un Client ID y Client Secret.', type='negative')
                        return
                    # Open auth url in user browser
                    url = meli_api.get_auth_url()
                    ui.notify('Abriendo ventana de autorización de Mercado Libre...', type='info')
                    ui.navigate.to(url, new_tab=True)
                    
                connect_btn = ui.button('Vincular Cuenta de Mercado Libre', icon='cloud_upload', on_click=connect_meli).classes('w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg')
                connect_btn.enabled = not is_demo
                
        # Right Panel: Merchant / Billing Details
        with ui.card().classes('w-[400px] q-pa-lg glass-card gap-4'):
            ui.label('2. Datos de Facturación').classes('text-xl font-bold text-blue-400 mb-2')
            ui.label('Esta información aparecerá en las facturas y comprobantes generados para tus clientes.').classes('text-xs text-slate-400')
            
            name_input = ui.input('Nombre Comercial / Empresa', value=database.get_setting('merchant_name', 'ControlCenterES S.A.')).classes('w-full').props('outlined dense dark')
            cuit_input = ui.input('Identificación Fiscal (CUIT/RFC/etc.)', value=database.get_setting('merchant_cuit', '30-71234567-9')).classes('w-full').props('outlined dense dark')
            address_input = ui.input('Dirección Comercial', value=database.get_setting('merchant_address', 'Av. Corrientes 1234, CABA')).classes('w-full').props('outlined dense dark')
            phone_input = ui.input('Teléfono de Contacto', value=database.get_setting('merchant_phone', '+54 11 4321-8765')).classes('w-full').props('outlined dense dark')
            
            def save_billing():
                database.set_setting('merchant_name', name_input.value.strip())
                database.set_setting('merchant_cuit', cuit_input.value.strip())
                database.set_setting('merchant_address', address_input.value.strip())
                database.set_setting('merchant_phone', phone_input.value.strip())
                ui.notify('Datos de facturación actualizados.', type='positive')
                
            ui.button('Guardar Datos Comerciales', on_click=save_billing).classes('w-full bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium py-2 rounded-lg')
            
    # Trigger callback message notifications if url queries are present (handled by javascript trigger on page load)
    # We can inject a small timer on startup to check callback status
    async def check_auth_results():
        # A quick hack is to fetch the current window location in JS to see query string
        query = await ui.run_javascript('window.location.search')
        if 'status=success' in query:
            ui.notify('¡Cuenta vinculada con éxito y catálogo inicial importado!', type='positive', duration=5)
            # clear the query params without reloading
            await ui.run_javascript('window.history.replaceState({}, document.title, "/settings")')
        elif 'status=error' in query:
            import urllib.parse
            params = urllib.parse.parse_qs(query.lstrip('?'))
            msg_list = params.get('msg', [])
            error_msg = msg_list[0] if msg_list else 'El proceso de autorización falló.'
            ui.notify(f'Error de vinculación: {error_msg}', type='negative', duration=8)
            await ui.run_javascript('window.history.replaceState({}, document.title, "/settings")')
            
    ui.timer(0.5, check_auth_results, once=True)

# Importing theme inside layout functions to avoid circular dependencies
from src.ui import theme
