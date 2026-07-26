import threading
import time
import traceback
from datetime import datetime
from src import meli_api, mp_api, config
from src.api.backup import check_and_run_monthly_auto_backup

def background_sync_loop():
    # Delay first run by 15 seconds to let the server start cleanly
    time.sleep(15)
    while True:
        try:
            # Check and run monthly automatic backup if due
            check_and_run_monthly_auto_backup()

            # Check if Meli credentials are configured
            if config.is_configured():
                print("[Scheduler] Iniciando sincronización automática en segundo plano...")
                # Get the start of the current day in local timezone to fetch "lo del día o momento"
                now_tz = datetime.now().astimezone()
                date_from = now_tz.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
                
                ok_p, count_p = meli_api.sync_products()
                ok_s, count_s = meli_api.sync_orders(limit=100, date_from=date_from)
                ok_mp, count_mp = mp_api.sync_mp_payments(date_from=date_from, limit=100)
                print(f"[Scheduler] Sincronización automática finalizada. Productos: {count_p} (ok: {ok_p}), Ventas MeLi: {count_s} (ok: {ok_s}), Cobros MP: {count_mp} (ok: {ok_mp})")
            else:
                # In demo mode, we also sync to generate mock data if cache is empty
                if config.get_setting("demo_mode") == "true":
                    print("[Scheduler] Modo Demo activo. Sincronizando datos de demostración...")
                    meli_api.sync_products()
                    meli_api.sync_orders(limit=20)
                    print("[Scheduler] Sincronización automática de demostración finalizada.")
            # Sincronización diaria de marcas monitoreadas en INPI
            try:
                from src.api.inpi import sync_monitored_trademarks
                sync_res = sync_monitored_trademarks()
                print(f"[Scheduler] Sincronización INPI: {sync_res.get('message')}")
            except Exception as inpi_err:
                print(f"[Scheduler] Error en sincronización INPI: {inpi_err}")

            # Procesar publicaciones de Marketing agendadas
            try:
                from src import database
                from src.utils import social_publisher
                due_posts = database.get_due_scheduled_marketing_posts()
                if due_posts:
                    print(f"[Scheduler] Procesando {len(due_posts)} publicaciones de Marketing programadas...")
                    for post in due_posts:
                        ok, summary = social_publisher.publish_post_to_all_platforms(post)
                        if ok:
                            database.update_marketing_post_status(post['id'], 'published', external_post_id=summary)
                            print(f"[Scheduler] Publicación #{post['id']} enviada a redes sociales: {summary}")
                        else:
                            database.update_marketing_post_status(post['id'], 'failed', error_message=summary)
                            print(f"[Scheduler] Error al publicar #{post['id']}: {summary}")
            except Exception as mkt_err:
                print(f"[Scheduler] Error procesando publicaciones de marketing:", mkt_err)

        except Exception as e:
            print("[Scheduler] Error en la tarea de segundo plano:", str(e))
            traceback.print_exc()
            
        # Get sync interval from config (default to 30 minutes)
        interval_mins = 30
        try:
            val = config.get_setting('meli_sync_interval', '30')
            interval_mins = int(val)
        except Exception:
            pass
            
        time.sleep(interval_mins * 60)

def start_scheduler():
    # Sleep interval read on start as default for logging
    try:
        val = config.get_setting('meli_sync_interval', '30')
        interval_mins = int(val)
    except Exception:
        interval_mins = 30
    print(f"[Scheduler] Iniciando daemon de tareas programadas (Sincronización cada {interval_mins}m)...")
    thread = threading.Thread(target=background_sync_loop, daemon=True)
    thread.start()
