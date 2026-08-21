import threading
import time
import traceback
from datetime import datetime
from src import meli_api, mp_api, config, tenancy
from src.api.backup import check_and_run_monthly_auto_backup

# Los hilos de fondo no atienden una petición HTTP, así que no hay subdominio
# del cual deducir el inquilino: cada tarea se ejecuta explícitamente dentro de
# `tenant_context(...)`, una vez por tenant activo.
#
# Esto es además el prerrequisito para cerrar el fail-open: mientras el
# scheduler corriera sin contexto, quitar `app.default_tenant` lo habría dejado
# sin ver ningún dato.


def _for_each_tenant(task_name, fn):
    """Ejecuta `fn()` una vez por tenant activo, aislando los errores.

    Que la sincronización de un cliente falle (token vencido, AFIP caída) no
    puede dejar sin sincronizar a los demás.
    """
    tenants = tenancy.list_active_tenants()
    for tenant in tenants:
        try:
            with tenancy.tenant_context(tenant["id"], tenant):
                fn(tenant)
        except Exception as exc:
            print(f"[Scheduler] {task_name} falló para '{tenant.get('slug')}': {exc}")
            traceback.print_exc()
    return len(tenants)


def _sync_one_tenant(tenant):
    """Sincronización de Mercado Libre / Mercado Pago de un único inquilino.

    El cuerpo es exactamente el que corría antes; lo único que cambió es que
    ahora se ejecuta bajo el contexto del tenant, así que `config` y `database`
    leen y escriben sus datos y no los de otro.
    """
    slug = tenant.get("slug")

    if config.is_configured():
        print(f"[Scheduler][{slug}] Iniciando sincronización automática...")
        now_tz = datetime.now().astimezone()
        date_from = now_tz.replace(hour=0, minute=0, second=0,
                                   microsecond=0).isoformat()

        ok_p, count_p = meli_api.sync_products()
        ok_s, count_s = meli_api.sync_orders(limit=100, date_from=date_from)
        ok_mp, count_mp = mp_api.sync_mp_payments(date_from=date_from, limit=100)
        print(f"[Scheduler][{slug}] Sincronización finalizada. "
              f"Productos: {count_p} (ok: {ok_p}), Ventas MeLi: {count_s} (ok: {ok_s}), "
              f"Cobros MP: {count_mp} (ok: {ok_mp})")
    else:
        # In demo mode, we also sync to generate mock data if cache is empty
        if config.get_setting("demo_mode") == "true":
            print(f"[Scheduler][{slug}] Modo Demo activo. Sincronizando datos de demostración...")
            meli_api.sync_products()
            meli_api.sync_orders(limit=20)
            print(f"[Scheduler][{slug}] Sincronización de demostración finalizada.")

    # Auto-responder de preguntas de Mercado Libre (Gemini AI)
    try:
        from src.utils.meli_questions_service import process_pending_questions
        processed_q = process_pending_questions()
        if processed_q:
            print(f"[Scheduler][{slug}] Preguntas MeLi procesadas con Gemini AI: {len(processed_q)}")
    except Exception as q_err:
        print(f"[Scheduler][{slug}] Error en auto-responder de preguntas MeLi: {q_err}")

    # Sincronización diaria de marcas monitoreadas en INPI
    try:
        from src.api.inpi import sync_monitored_trademarks
        sync_res = sync_monitored_trademarks()
        print(f"[Scheduler][{slug}] Sincronización INPI: {sync_res.get('message')}")
    except Exception as inpi_err:
        print(f"[Scheduler][{slug}] Error en sincronización INPI: {inpi_err}")

    # Programación automática de disponibilidad de envíos MeLi
    try:
        from src.api.inventory import process_auto_shipping_schedules
        process_auto_shipping_schedules()
    except Exception as ship_err:
        print(f"[Scheduler][{slug}] Error en auto-envíos MeLi: {ship_err}")

    # Alertas automáticas por WhatsApp de vencimientos de servicios e impuestos
    _check_vencimientos_alerts_for_tenant(tenant)

    # Sincronización automática de clientes/leads desde Meta (Instagram & Facebook Ads)
    try:
        from src.utils import social_publisher
        leads_res = social_publisher.fetch_and_sync_all_meta_leads()
        if leads_res.get("synced_count", 0) > 0:
            print(f"[Scheduler][{slug}] Leads de Meta sincronizados: {leads_res.get('synced_count')} clientes importados.")
    except Exception as meta_err:
        print(f"[Scheduler][{slug}] Error en sincronización de leads de Meta: {meta_err}")



def background_sync_loop():
    # Delay first run by 15 seconds to let the server start cleanly
    time.sleep(15)
    while True:
        try:
            # El respaldo es una operación de plataforma, no de inquilino:
            # pg_dump vuelca la base entera. Va una sola vez, fuera del bucle.
            check_and_run_monthly_auto_backup()

            count = _for_each_tenant("Sincronización", _sync_one_tenant)
            if count == 0:
                print("[Scheduler] No hay tenants activos para sincronizar.")

        except Exception as e:
            print("[Scheduler] Error en la tarea de segundo plano:", str(e))
            traceback.print_exc()

        # El intervalo lo define el Tenant Maestro: es una cadencia de
        # plataforma, no una preferencia por cliente.
        interval_mins = 30
        try:
            with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
                val = config.get_setting('meli_sync_interval', '30')
            interval_mins = int(val)
        except Exception:
            pass

        time.sleep(interval_mins * 60)


def _publish_due_posts_for_tenant(tenant):
    from src import database
    from src.utils import social_publisher

    due_posts = database.get_due_scheduled_marketing_posts()
    if not due_posts:
        return

    slug = tenant.get("slug")
    print(f"[Scheduler-Marketing][{slug}] Procesando {len(due_posts)} "
          f"publicaciones programadas...")
    for post in due_posts:
        try:
            ok, summary = social_publisher.publish_post_to_all_platforms(post)
            if ok:
                database.update_marketing_post_status(post['id'], 'published',
                                                      external_post_id=summary)
                print(f"[Scheduler-Marketing][{slug}] Publicación #{post['id']} "
                      f"enviada a redes sociales: {summary}")
            else:
                database.update_marketing_post_status(post['id'], 'failed',
                                                      error_message=summary)
                print(f"[Scheduler-Marketing][{slug}] Error al publicar "
                      f"#{post['id']}: {summary}")
        except Exception as post_err:
            # Una publicación rota no puede frenar la cola del resto.
            print(f"[Scheduler-Marketing][{slug}] Excepción publicando "
                  f"#{post.get('id')}: {post_err}")
            try:
                database.update_marketing_post_status(post['id'], 'failed',
                                                      error_message=str(post_err))
            except Exception:
                pass


def marketing_publisher_loop():
    # Dedicated fast background loop for marketing posts (runs every 30 seconds)
    time.sleep(5)
    while True:
        try:
            _for_each_tenant("Marketing", _publish_due_posts_for_tenant)
        except Exception as mkt_err:
            print("[Scheduler-Marketing] Error procesando publicaciones de marketing:",
                  mkt_err)

        time.sleep(30)


def start_scheduler():
    # Sleep interval read on start as default for logging
    try:
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            val = config.get_setting('meli_sync_interval', '30')
        interval_mins = int(val)
    except Exception:
        interval_mins = 30
    print(f"[Scheduler] Iniciando daemon de tareas programadas (Sincronización cada {interval_mins}m, Marketing cada 30s)...")
    thread_sync = threading.Thread(target=background_sync_loop, daemon=True)
    thread_sync.start()

    thread_mkt = threading.Thread(target=marketing_publisher_loop, daemon=True)
    thread_mkt.start()

def _check_vencimientos_alerts_for_tenant(tenant):
    from src import database
    import requests

    slug = tenant.get("slug")
    alert_phone = database.get_setting("vencimientos_alert_phone", "").strip()
    if not alert_phone:
        alert_phone = database.get_setting("whatsapp_bot_phone", database.get_setting("admin_phone", "")).strip()

    if not alert_phone:
        return

    alert_days = 3
    try:
        alert_days = int(database.get_setting("vencimientos_alert_days", "3"))
    except Exception:
        pass

    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, description, category, amount, due_date, status, payment_link, payment_code, last_alert_sent_at
                    FROM service_payments
                    WHERE status IN ('pending', 'overdue')
                      AND (last_alert_sent_at IS NULL OR last_alert_sent_at::date < CURRENT_DATE)
                      AND (due_date - CURRENT_DATE <= %s)
                    ORDER BY due_date ASC
                    """,
                    (alert_days,)
                )
                vencimientos = cursor.fetchall()

                for v in vencimientos:
                    d_str = str(v['due_date'])
                    amt = float(v['amount'])
                    amt_formatted = f"${amt:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
                    
                    status_emoji = "🔴" if v.get('status') == 'overdue' else "🟡"
                    msg = f"{status_emoji} *ALERTA DE VENCIMIENTO - ControlCenterES*\n\n" \
                          f"📌 *Servicio:* {v['description']}\n" \
                          f"🏷️ *Categoría:* {v.get('category') or 'Servicios'}\n" \
                          f"💰 *Monto:* {amt_formatted}\n" \
                          f"📅 *Fecha Vencimiento:* {d_str}\n"
                    
                    if v.get('payment_link'):
                        msg += f"\n👉 *Pagar ahora:* {v['payment_link']}\n"
                    if v.get('payment_code'):
                        msg += f"\n📋 *Código de pago:* `{v['payment_code']}`\n"

                    msg += "\n_Mensaje automático de ControlCenterES Finanzas._"

                    try:
                        res = requests.post("http://127.0.0.1:8091/send-broadcast", json={
                            "recipients": [{"phone": alert_phone, "name": "Administrador"}],
                            "message": msg,
                            "delaySeconds": 1
                        }, timeout=10)

                        if res.status_code == 200:
                            cursor.execute("UPDATE service_payments SET last_alert_sent_at = NOW() WHERE id = %s", (v['id'],))
                            print(f"[Scheduler-Vencimientos][{slug}] Alerta enviada por WhatsApp para '{v['description']}' a {alert_phone}")
                    except Exception as send_err:
                        print(f"[Scheduler-Vencimientos][{slug}] Error al enviar WhatsApp: {send_err}")
    except Exception as e:
        print(f"[Scheduler-Vencimientos][{slug}] Error procesando alertas de vencimientos: {e}")

