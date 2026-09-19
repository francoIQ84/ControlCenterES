"""
Registro de sincronización por inquilino (Mercado Libre, Mercado Pago, Tiendanube).

Por qué existe
--------------
Hasta acá cada sincronización elegía su ventana en el aire: el scheduler pedía
"desde la medianoche de hoy", el botón del panel "las últimas 24 horas". Si el
servicio estuvo caído el fin de semana, esas ventas no las recuperaba nadie:
nada recordaba hasta dónde se había llegado.

Este módulo guarda esa memoria, y la guarda **por tenant**, porque cada negocio
tiene sus propias cuentas y sus propios cortes:

    * `integration_sync_state` — una fila por (tenant, proveedor, recurso) con
      la marca de agua vigente: desde qué fecha arranca la próxima corrida.
    * `integration_sync_log`   — el historial, para auditar y diagnosticar.

El aislamiento lo hace RLS, igual que en el resto del sistema: las consultas de
acá no filtran por tenant_id, lo filtra PostgreSQL.

Uso típico
----------
::

    with sync_state.begin("mercadolibre", "orders", trigger="scheduler") as run:
        ok, count = meli_api.sync_orders(limit=100, date_from=run.date_from)
        run.finish(ok, count)

Si la corrida falla —o revienta con una excepción— la marca de agua **no**
avanza, así que la próxima vuelve a pedir la misma ventana. Perder un pedido es
un problema contable; procesarlo dos veces no lo es, porque los `upsert` de
`database` son idempotentes.

Degradación
-----------
Mientras la migración 015 no esté aplicada, todas las funciones caen a un modo
inerte: devuelven valores por defecto y no rompen ninguna sincronización. Es
deliberado: esto es instrumentación, no puede voltear la operación.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Optional

import psycopg2

from src import database

#: Recursos que se sincronizan en cada proveedor. Es también la lista que se
#: muestra en el panel, así que el orden importa.
PROVIDER_RESOURCES = {
    "mercadolibre": ("orders", "products"),
    "mercadopago": ("payments",),
    "tiendanube": ("orders",),
}

#: Etiquetas para el panel. El backend las manda hechas para que el frontend no
#: tenga que mantener un diccionario paralelo.
RESOURCE_LABELS = {
    ("mercadolibre", "orders"): "Ventas de Mercado Libre",
    ("mercadolibre", "products"): "Catálogo de publicaciones",
    ("mercadopago", "payments"): "Cobros y movimientos de Mercado Pago",
    ("tiendanube", "orders"): "Pedidos de Tiendanube",
}

PROVIDER_LABELS = {
    "mercadolibre": "Mercado Libre",
    "mercadopago": "Mercado Pago",
    "tiendanube": "Tiendanube",
}

TRIGGERS = ("scheduler", "manual", "webhook")

#: Ventana por defecto cuando el canal nunca se sincronizó.
DEFAULT_LOOKBACK_DAYS = 7

#: Solape sobre la marca de agua. Los proveedores no garantizan que un pedido
#: aparezca en su índice de búsqueda en el mismo instante en que se creó, así
#: que se vuelve un rato para atrás y se deja que el upsert resuelva el
#: duplicado.
DEFAULT_OVERLAP_MINUTES = 15

#: Retención del historial. Suficiente para auditar un trimestre sin que la
#: tabla crezca sin techo.
LOG_RETENTION_DAYS = 90


class UnknownResource(ValueError):
    pass


def _check(provider: str, resource: str):
    provider = (provider or "").strip().lower()
    resource = (resource or "").strip().lower()
    known = PROVIDER_RESOURCES.get(provider)
    if not known or resource not in known:
        raise UnknownResource(
            f"No se sincroniza '{resource}' en '{provider}'. "
            "Combinaciones válidas: "
            + ", ".join(f"{p}/{r}" for p, rs in PROVIDER_RESOURCES.items() for r in rs))
    return provider, resource


def _now():
    """Ahora, con la zona horaria del servidor (Buenos Aires en producción)."""
    return datetime.now().astimezone()


def _as_aware(value):
    """Normaliza a datetime con zona. PostgreSQL devuelve timestamptz, pero un
    llamador puede pasar una cadena ISO o un naive."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if value.tzinfo is None:
        return value.replace(tzinfo=_now().tzinfo)
    return value


def _iso(value) -> Optional[str]:
    value = _as_aware(value)
    return value.isoformat() if value else None


# ---------------------------------------------------------------------------
# Lectura
# ---------------------------------------------------------------------------

def get_state(provider: str, resource: str) -> Optional[dict]:
    """Marca de agua del canal para el tenant activo, o None si nunca corrió."""
    provider, resource = _check(provider, resource)
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT * FROM integration_sync_state "
                    "WHERE provider = %s AND resource = %s",
                    (provider, resource))
                row = cursor.fetchone()
        return dict(row) if row else None
    except psycopg2.Error:
        # Migración 015 sin aplicar: se comporta como un canal nunca sincronizado.
        return None


def resume_from(provider: str, resource: str,
                default_days: int = DEFAULT_LOOKBACK_DAYS,
                overlap_minutes: int = DEFAULT_OVERLAP_MINUTES) -> datetime:
    """Desde qué fecha tiene que arrancar la próxima sincronización.

    Es la marca de agua menos el solape; si el canal nunca se sincronizó, la
    ventana por defecto hacia atrás.
    """
    state = get_state(provider, resource)
    cursor_at = _as_aware(state.get("cursor_at")) if state else None
    if cursor_at:
        return cursor_at - timedelta(minutes=max(0, overlap_minutes))
    return _now() - timedelta(days=max(0, default_days))


def resume_from_iso(provider: str, resource: str, **kwargs) -> str:
    """`resume_from` en el formato ISO que esperan las APIs de los proveedores."""
    return resume_from(provider, resource, **kwargs).isoformat()


def list_states() -> list:
    """Estado de todos los canales del tenant, incluidos los que nunca corrieron.

    Devuelve siempre la grilla completa (proveedor x recurso) para que el panel
    pueda mostrar "nunca sincronizado" en lugar de esconder la fila.
    """
    stored = {}
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM integration_sync_state")
                for row in cursor.fetchall():
                    stored[(row["provider"], row["resource"])] = dict(row)
    except psycopg2.Error:
        stored = {}

    result = []
    for provider, resources in PROVIDER_RESOURCES.items():
        for resource in resources:
            row = stored.get((provider, resource)) or {}
            # La próxima ventana se calcula sobre la fila que ya tenemos: pedirla
            # con resume_from() abriría una conexión por canal para releer lo
            # mismo.
            cursor_at = _as_aware(row.get("cursor_at"))
            next_from = (cursor_at - timedelta(minutes=DEFAULT_OVERLAP_MINUTES)
                         if cursor_at else None)
            result.append({
                "provider": provider,
                "provider_label": PROVIDER_LABELS.get(provider, provider),
                "resource": resource,
                "resource_label": RESOURCE_LABELS.get((provider, resource), resource),
                "cursor_at": _iso(cursor_at),
                "next_window_from": _iso(next_from),
                "last_run_at": _iso(row.get("last_run_at")),
                "last_success_at": _iso(row.get("last_success_at")),
                "last_status": row.get("last_status"),
                "last_error": row.get("last_error"),
                "last_items": row.get("last_items") or 0,
                "last_trigger": row.get("last_trigger"),
                "total_items": row.get("total_items") or 0,
                "total_runs": row.get("total_runs") or 0,
                "consecutive_failures": row.get("consecutive_failures") or 0,
                "never_synced": not row.get("last_success_at"),
            })
    return result


def list_runs(provider: Optional[str] = None, resource: Optional[str] = None,
              limit: int = 50) -> list:
    """Historial de corridas del tenant, de la más reciente a la más vieja."""
    limit = max(1, min(int(limit or 50), 500))
    clauses, params = [], []
    if provider:
        clauses.append("provider = %s")
        params.append(provider.strip().lower())
    if resource:
        clauses.append("resource = %s")
        params.append(resource.strip().lower())
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    params.append(limit)

    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT * FROM integration_sync_log {where} "
                    "ORDER BY started_at DESC, id DESC LIMIT %s", params)
                rows = cursor.fetchall()
    except psycopg2.Error:
        return []

    return [{
        "id": r["id"],
        "provider": r["provider"],
        "provider_label": PROVIDER_LABELS.get(r["provider"], r["provider"]),
        "resource": r["resource"],
        "resource_label": RESOURCE_LABELS.get((r["provider"], r["resource"]),
                                              r["resource"]),
        "trigger_source": r["trigger_source"],
        "status": r["status"],
        "window_from": _iso(r["window_from"]),
        "window_to": _iso(r["window_to"]),
        "items_synced": r["items_synced"],
        "error_message": r["error_message"],
        "started_at": _iso(r["started_at"]),
        "finished_at": _iso(r["finished_at"]),
        "duration_ms": r["duration_ms"],
    } for r in rows]


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------

def reset_state(provider: str, resource: str,
                cursor_at: Optional[datetime] = None) -> bool:
    """Mueve la marca de agua a mano.

    Sirve para dos cosas reales: rebobinar cuando un canal estuvo devolviendo
    basura, y arrancar de cero (`cursor_at=None`) después de cambiar de cuenta.
    """
    provider, resource = _check(provider, resource)
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO integration_sync_state (provider, resource, cursor_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (tenant_id, provider, resource) DO UPDATE SET
                        cursor_at  = EXCLUDED.cursor_at,
                        updated_at = CURRENT_TIMESTAMP
                """, (provider, resource, _as_aware(cursor_at)))
        return True
    except psycopg2.Error:
        return False


def prune_log(retention_days: int = LOG_RETENTION_DAYS) -> int:
    """Borra corridas viejas del historial. Devuelve cuántas filas se fueron."""
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM integration_sync_log "
                    "WHERE started_at < CURRENT_TIMESTAMP - make_interval(days => %s)",
                    (max(1, int(retention_days)),))
                return cursor.rowcount or 0
    except psycopg2.Error:
        return 0


class SyncRun:
    """Una corrida de sincronización en curso.

    Se crea con `begin()`, expone la ventana a pedirle al proveedor y se cierra
    con `finish()`. Mientras esté abierta ya hay una fila en el historial con
    estado `running`, así que una corrida que se cuelga queda visible en vez de
    desaparecer.
    """

    def __init__(self, provider, resource, trigger, window_from, window_to,
                 run_id=None, enabled=True, resumed=False):
        self.provider = provider
        self.resource = resource
        self.trigger = trigger
        #: True si la ventana salió de una marca de agua guardada. False cuando
        #: es la primera corrida del canal y se usó la ventana por defecto:
        #: ahí conviene no filtrar por fecha y traer lo último que haya.
        self.resumed = resumed
        self.window_from = window_from
        # La ventana cierra en el instante en que arranca la corrida: todo lo
        # que entre después es problema de la próxima, no un hueco.
        self.window_to = window_to
        self.started_at = window_to
        self.run_id = run_id
        self.enabled = enabled
        self.closed = False

    @property
    def date_from(self) -> Optional[str]:
        """La ventana en ISO, lista para pasarle a `sync_orders(date_from=...)`."""
        return self.window_from.isoformat() if self.window_from else None

    def catch_up_limit(self, base=100, per_day=300, cap=2000) -> int:
        """Cuántos registros pedir según lo atrasada que esté la ventana.

        Con un tope fijo, un fin de semana caído se traducía en una ventana de
        tres días truncada a los 100 movimientos más recientes: el resto se
        perdía en silencio. El tope ahora acompaña al atraso real.
        """
        if not self.window_from or not self.window_to:
            return base
        days = max(0.0, (self.window_to - self.window_from).total_seconds() / 86400.0)
        return int(min(cap, max(base, days * per_day)))

    # -- cierre ------------------------------------------------------------
    def finish(self, ok, result=None):
        """Cierra la corrida con el `(ok, cantidad_o_mensaje)` que devuelven los
        `sync_*` del sistema."""
        if ok:
            items = result if isinstance(result, int) else 0
            return self._close("success", items=items)
        return self._close("error", error=str(result) if result is not None
                           else "La sincronización devolvió un fallo sin detalle")

    def fail(self, error):
        return self._close("error", error=str(error))

    def skip(self, reason=""):
        """El canal no estaba configurado o no había nada que hacer.

        No avanza la marca de agua: no se sincronizó nada.
        """
        return self._close("skipped", error=reason or None)

    def _close(self, status, items=0, error=None):
        if self.closed:
            return
        self.closed = True
        if not self.enabled:
            return

        finished_at = _now()
        duration_ms = None
        if self.started_at:
            duration_ms = int((finished_at - self.started_at).total_seconds() * 1000)

        try:
            with database.get_connection() as conn:
                with conn.cursor() as cursor:
                    if self.run_id:
                        cursor.execute("""
                            UPDATE integration_sync_log
                               SET status = %s, items_synced = %s, error_message = %s,
                                   finished_at = %s, duration_ms = %s
                             WHERE id = %s
                        """, (status, items, error, finished_at, duration_ms,
                              self.run_id))
                    if status == "skipped":
                        return
                    # La marca de agua solo avanza cuando la corrida cerró bien:
                    # si falló, la próxima tiene que volver a pedir la misma
                    # ventana.
                    cursor.execute("""
                        INSERT INTO integration_sync_state
                            (provider, resource, cursor_at, last_run_at,
                             last_success_at, last_status, last_error, last_items,
                             last_trigger, total_items, total_runs,
                             consecutive_failures)
                        VALUES (%(provider)s, %(resource)s,
                                CASE WHEN %(ok)s THEN %(window_to)s ELSE NULL END,
                                %(run_at)s,
                                CASE WHEN %(ok)s THEN %(run_at)s ELSE NULL END,
                                %(status)s, %(error)s, %(items)s, %(trigger)s,
                                %(items)s, 1, CASE WHEN %(ok)s THEN 0 ELSE 1 END)
                        ON CONFLICT (tenant_id, provider, resource) DO UPDATE SET
                            cursor_at = CASE WHEN %(ok)s THEN %(window_to)s
                                        ELSE integration_sync_state.cursor_at END,
                            last_run_at = %(run_at)s,
                            last_success_at = CASE WHEN %(ok)s THEN %(run_at)s
                                        ELSE integration_sync_state.last_success_at END,
                            last_status = %(status)s,
                            last_error = %(error)s,
                            last_items = %(items)s,
                            last_trigger = %(trigger)s,
                            total_items = integration_sync_state.total_items + %(items)s,
                            total_runs = integration_sync_state.total_runs + 1,
                            consecutive_failures = CASE WHEN %(ok)s THEN 0
                                ELSE integration_sync_state.consecutive_failures + 1 END,
                            updated_at = CURRENT_TIMESTAMP
                    """, {
                        "provider": self.provider,
                        "resource": self.resource,
                        "ok": status == "success",
                        "window_to": self.window_to,
                        "run_at": finished_at,
                        "status": status,
                        "error": error,
                        "items": items,
                        "trigger": self.trigger,
                    })
        except psycopg2.Error as exc:
            print(f"[SyncState] No se pudo registrar {self.provider}/"
                  f"{self.resource}: {exc}")

    # -- context manager ---------------------------------------------------
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc is not None:
            self._close("error", error=f"{exc_type.__name__}: {exc}")
        elif not self.closed:
            # El llamador se olvidó de cerrarla. Queda como error a propósito:
            # una corrida sin resultado no puede pasar por exitosa.
            self._close("error",
                        error="La sincronización terminó sin reportar resultado")
        return False


def begin(provider: str, resource: str, trigger: str = "scheduler",
          date_from=None, full: bool = False,
          default_days: int = DEFAULT_LOOKBACK_DAYS,
          overlap_minutes: int = DEFAULT_OVERLAP_MINUTES) -> SyncRun:
    """Abre una corrida y calcula desde cuándo hay que sincronizar.

    Un `date_from` explícito (el botón de "últimas 24hs", una recuperación
    manual) manda sobre la marca de agua; si no se pasa nada, la ventana sale
    del registro del tenant.

    `full=True` es la bajada histórica completa: sin filtro de fecha. Se
    registra igual —y también mueve la marca de agua al terminar— porque
    después de traer todo, lo que falta es justamente lo que pase de ahí en
    adelante.
    """
    provider, resource = _check(provider, resource)
    trigger = trigger if trigger in TRIGGERS else "scheduler"

    window_to = _now()
    if full:
        resumed = False
        window_from = None
    elif date_from is None:
        state = get_state(provider, resource)
        cursor_at = _as_aware(state.get("cursor_at")) if state else None
        resumed = cursor_at is not None
        window_from = (cursor_at - timedelta(minutes=max(0, overlap_minutes))
                       if resumed
                       else window_to - timedelta(days=max(0, default_days)))
    else:
        resumed = False
        window_from = _as_aware(date_from)

    run_id = None
    enabled = True
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO integration_sync_log
                        (provider, resource, trigger_source, status,
                         window_from, window_to, started_at)
                    VALUES (%s, %s, %s, 'running', %s, %s, %s)
                    RETURNING id
                """, (provider, resource, trigger, window_from, window_to,
                      window_to))
                row = cursor.fetchone()
                run_id = row["id"] if row else None
    except psycopg2.Error:
        # Sin tabla (migración pendiente) la corrida sigue: solo no se registra.
        enabled = False

    return SyncRun(provider, resource, trigger, window_from, window_to,
                   run_id=run_id, enabled=enabled, resumed=resumed)


@contextmanager
def track(provider: str, resource: str, **kwargs):
    """Azúcar sobre `begin()` para los llamadores que prefieren `with`."""
    run = begin(provider, resource, **kwargs)
    with run:
        yield run
