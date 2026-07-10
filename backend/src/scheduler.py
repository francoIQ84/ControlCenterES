import threading
import time
import traceback
from src import meli_api, config

def background_sync_loop():
    # Delay first run by 15 seconds to let the server start cleanly
    time.sleep(15)
    while True:
        try:
            # Check if Meli credentials are configured
            if config.is_configured():
                print("[Scheduler] Iniciando sincronización automática en segundo plano...")
                ok_p, count_p = meli_api.sync_products()
                ok_s, count_s = meli_api.sync_orders(limit=100)
                print(f"[Scheduler] Sincronización automática finalizada. Productos: {count_p} (ok: {ok_p}), Ventas: {count_s} (ok: {ok_s})")
            else:
                # In demo mode, we also sync to generate mock data if cache is empty
                if config.get_setting("demo_mode") == "true":
                    print("[Scheduler] Modo Demo activo. Sincronizando datos de demostración...")
                    meli_api.sync_products()
                    meli_api.sync_orders(limit=20)
                    print("[Scheduler] Sincronización automática de demostración finalizada.")
        except Exception as e:
            print("[Scheduler] Error en la tarea de segundo plano:", str(e))
            traceback.print_exc()
            
        # Sleep for 15 minutes (900 seconds)
        time.sleep(900)

def start_scheduler():
    print("[Scheduler] Iniciando daemon de tareas programadas (Sincronización cada 15m)...")
    thread = threading.Thread(target=background_sync_loop, daemon=True)
    thread.start()
