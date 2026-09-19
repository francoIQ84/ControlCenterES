"""
Tests unitarios del registro de sincronización (src/sync_state.py).

No tocan la base: se sustituye `database.get_connection` por un doble que
registra el SQL y devuelve filas preparadas. Lo que interesa verificar es la
lógica que decide **desde qué fecha** se sincroniza y **cuándo avanza** la marca
de agua, que es de donde salen los agujeros de ventas cuando está mal.
"""

import sys
import types
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import psycopg2

# `src.database` llama a load_dotenv() al importarse. Es una dependencia de
# despliegue, no de esta lógica: se sustituye por un stub para que los tests
# corran en un entorno pelado, que es la única forma de que se ejecuten seguido.
if "dotenv" not in sys.modules:
    try:
        import dotenv  # noqa: F401
    except ImportError:
        stub = types.ModuleType("dotenv")
        stub.load_dotenv = lambda *args, **kwargs: False
        sys.modules["dotenv"] = stub

from src import sync_state  # noqa: E402


class FakeCursor:
    """Cursor mínimo: guarda lo ejecutado y consume la cola de resultados."""

    def __init__(self, db):
        self._db = db
        self._last = None
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self._db.calls.append((sql, params))
        self._last = self._db.rows.pop(0) if self._db.rows else None

    def fetchone(self):
        return self._last

    def fetchall(self):
        return self._last or []


class FakeConnection:
    def __init__(self, db):
        self._db = db

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return FakeCursor(self._db)


class fake_db:
    """Context manager que reemplaza `database.get_connection`.

    `rows` es la cola de resultados que devuelven los `execute` sucesivos, en
    orden y compartida entre todas las conexiones: así se puede guionar una
    secuencia como "el SELECT del estado no encuentra nada, el INSERT del log
    devuelve el id 55".
    """

    def __init__(self, rows=(), error=False):
        self.rows = list(rows)
        self.error = error
        self.calls = []

    def __enter__(self):
        def _factory():
            if self.error:
                raise psycopg2.OperationalError(
                    'relation "integration_sync_state" does not exist')
            return FakeConnection(self)

        self._patcher = patch.object(sync_state.database, "get_connection", _factory)
        self._patcher.start()
        return self

    def __exit__(self, *exc):
        self._patcher.stop()
        return False

    def sql_containing(self, needle):
        """Todas las llamadas cuyo SQL contiene `needle`."""
        return [(sql, params) for sql, params in self.calls if needle in sql]


class CombinacionesValidasTest(unittest.TestCase):
    def test_acepta_los_canales_del_sistema(self):
        for provider, resources in sync_state.PROVIDER_RESOURCES.items():
            for resource in resources:
                with self.subTest(canal=f"{provider}/{resource}"):
                    self.assertEqual(sync_state._check(provider, resource),
                                     (provider, resource))

    def test_normaliza_mayusculas_y_espacios(self):
        self.assertEqual(sync_state._check("  MercadoLibre ", "Orders"),
                         ("mercadolibre", "orders"))

    def test_rechaza_un_recurso_que_no_existe_en_el_proveedor(self):
        # Mercado Pago no tiene catálogo: pedirlo es un error de programación,
        # no algo que deba quedar registrado como si fuera un canal.
        with self.assertRaises(sync_state.UnknownResource):
            sync_state._check("mercadopago", "products")

    def test_rechaza_un_proveedor_desconocido(self):
        with self.assertRaises(sync_state.UnknownResource):
            sync_state._check("shopify", "orders")


class VentanaDeSincronizacionTest(unittest.TestCase):
    def test_sin_marca_de_agua_usa_la_ventana_por_defecto(self):
        with fake_db(rows=[None]):
            desde = sync_state.resume_from("mercadolibre", "orders")
        esperado = sync_state._now() - timedelta(days=sync_state.DEFAULT_LOOKBACK_DAYS)
        self.assertLess(abs((desde - esperado).total_seconds()), 5)

    def test_con_marca_de_agua_arranca_desde_ahi_menos_el_solape(self):
        cursor_at = sync_state._now() - timedelta(hours=3)
        with fake_db(rows=[{"cursor_at": cursor_at}]):
            desde = sync_state.resume_from("mercadolibre", "orders",
                                           overlap_minutes=15)
        self.assertLess(abs((desde - (cursor_at - timedelta(minutes=15))).total_seconds()), 2)

    def test_el_solape_vuelve_para_atras_nunca_para_adelante(self):
        """El solape existe para tolerar la latencia del proveedor: pedir desde
        *después* de la marca de agua abriría un agujero."""
        cursor_at = sync_state._now() - timedelta(hours=1)
        with fake_db(rows=[{"cursor_at": cursor_at}]):
            desde = sync_state.resume_from("mercadolibre", "orders")
        self.assertLess(desde, cursor_at)

    def test_sin_tabla_no_explota_y_cae_a_la_ventana_por_defecto(self):
        """Mientras la migración 015 no esté aplicada, la sincronización tiene
        que seguir andando igual que antes."""
        with fake_db(error=True):
            desde = sync_state.resume_from("mercadopago", "payments")
            self.assertIsNone(sync_state.get_state("mercadopago", "payments"))
        esperado = sync_state._now() - timedelta(days=sync_state.DEFAULT_LOOKBACK_DAYS)
        self.assertLess(abs((desde - esperado).total_seconds()), 5)


class AperturaDeCorridaTest(unittest.TestCase):
    def test_retoma_desde_la_marca_de_agua_guardada(self):
        cursor_at = sync_state._now() - timedelta(days=2)
        with fake_db(rows=[{"cursor_at": cursor_at}, {"id": 41}]):
            run = sync_state.begin("mercadolibre", "orders")
        self.assertTrue(run.resumed)
        self.assertEqual(run.run_id, 41)
        self.assertLess(abs((run.window_from - (cursor_at - timedelta(
            minutes=sync_state.DEFAULT_OVERLAP_MINUTES))).total_seconds()), 2)

    def test_una_fecha_explicita_manda_sobre_la_marca_de_agua(self):
        """Es el botón de 'últimas 24hs': el usuario pidió esa ventana."""
        pedido = sync_state._now() - timedelta(hours=24)
        with fake_db(rows=[{"id": 7}]):
            run = sync_state.begin("mercadopago", "payments", trigger="manual",
                                   date_from=pedido.isoformat())
        self.assertFalse(run.resumed)
        self.assertEqual(run.window_from, pedido)
        self.assertEqual(run.date_from, pedido.isoformat())

    def test_la_bajada_historica_va_sin_filtro_de_fecha(self):
        """`full=True` no puede convertirse en una ventana de 7 días: la
        intención es traer todo."""
        with fake_db(rows=[{"id": 9}]):
            run = sync_state.begin("mercadolibre", "orders", trigger="manual",
                                   full=True)
        self.assertIsNone(run.window_from)
        self.assertIsNone(run.date_from)

    def test_la_ventana_cierra_al_arrancar_la_corrida(self):
        with fake_db(rows=[None, {"id": 1}]):
            run = sync_state.begin("tiendanube", "orders")
        self.assertEqual(run.window_to, run.started_at)
        self.assertLess(abs((run.window_to - sync_state._now()).total_seconds()), 5)

    def test_sin_tabla_la_corrida_sigue_pero_no_se_registra(self):
        with fake_db(error=True):
            run = sync_state.begin("mercadolibre", "products")
            self.assertFalse(run.enabled)
            run.finish(True, 12)   # no debe levantar
        self.assertTrue(run.closed)

    def test_un_disparador_desconocido_cae_a_automatica(self):
        with fake_db(rows=[None, {"id": 3}]):
            run = sync_state.begin("mercadolibre", "orders", trigger="cualquiera")
        self.assertEqual(run.trigger, "scheduler")


class CierreDeCorridaTest(unittest.TestCase):
    """Lo central: la marca de agua solo avanza cuando la corrida cerró bien."""

    def _run(self, rows=None):
        rows = rows if rows is not None else [None, {"id": 55}]
        db = fake_db(rows=rows)
        db.__enter__()
        run = sync_state.begin("mercadolibre", "orders")
        return db, run

    def test_una_corrida_exitosa_avanza_la_marca_de_agua(self):
        db, run = self._run()
        try:
            run.finish(True, 23)
            estado = db.sql_containing("INSERT INTO integration_sync_state")
            self.assertEqual(len(estado), 1)
            params = estado[0][1]
            self.assertTrue(params["ok"])
            self.assertEqual(params["status"], "success")
            self.assertEqual(params["items"], 23)
            self.assertEqual(params["window_to"], run.window_to)
        finally:
            db.__exit__()

    def test_una_corrida_fallida_no_avanza_la_marca_de_agua(self):
        """El caso que motiva todo esto: si Mercado Libre devolvió 401, la
        próxima corrida tiene que volver a pedir la misma ventana."""
        db, run = self._run()
        try:
            run.finish(False, "Error Mercado Libre API (401)")
            params = db.sql_containing("INSERT INTO integration_sync_state")[0][1]
            self.assertFalse(params["ok"])
            self.assertEqual(params["status"], "error")
            self.assertEqual(params["error"], "Error Mercado Libre API (401)")
            self.assertEqual(params["items"], 0)
        finally:
            db.__exit__()

    def test_una_excepcion_cierra_la_corrida_como_error_y_se_propaga(self):
        db = fake_db(rows=[None, {"id": 77}])
        db.__enter__()
        try:
            with self.assertRaises(RuntimeError):
                with sync_state.begin("mercadopago", "payments") as run:
                    raise RuntimeError("se cayó la red")
            params = db.sql_containing("INSERT INTO integration_sync_state")[0][1]
            self.assertFalse(params["ok"])
            self.assertIn("se cayó la red", params["error"])
        finally:
            db.__exit__()

    def test_una_corrida_que_no_reporta_resultado_queda_como_error(self):
        """Salir del `with` sin llamar a finish() no puede pasar por éxito: la
        marca de agua avanzaría sin que nadie haya traído nada."""
        db = fake_db(rows=[None, {"id": 78}])
        db.__enter__()
        try:
            with sync_state.begin("tiendanube", "orders"):
                pass
            params = db.sql_containing("INSERT INTO integration_sync_state")[0][1]
            self.assertFalse(params["ok"])
        finally:
            db.__exit__()

    def test_una_corrida_omitida_no_toca_el_estado(self):
        """El canal no estaba configurado: queda en el historial, pero la marca
        de agua no se mueve ni cuenta como fallo."""
        db, run = self._run()
        try:
            run.skip("Tiendanube no está vinculada")
            self.assertEqual(db.sql_containing("INSERT INTO integration_sync_state"), [])
            log = db.sql_containing("UPDATE integration_sync_log")
            self.assertEqual(len(log), 1)
            self.assertEqual(log[0][1][0], "skipped")
        finally:
            db.__exit__()

    def test_cerrar_dos_veces_registra_una_sola(self):
        db, run = self._run()
        try:
            run.finish(True, 5)
            run.finish(True, 999)
            self.assertEqual(len(db.sql_containing("INSERT INTO integration_sync_state")), 1)
        finally:
            db.__exit__()

    def test_un_resultado_no_numerico_no_se_cuenta_como_registros(self):
        """Los `sync_*` devuelven (False, "mensaje") y a veces (True, count).
        Un mensaje nunca es una cantidad."""
        db, run = self._run()
        try:
            run.finish(True, "sincronizado")
            params = db.sql_containing("INSERT INTO integration_sync_state")[0][1]
            self.assertEqual(params["items"], 0)
        finally:
            db.__exit__()


class EstadoParaElPanelTest(unittest.TestCase):
    def test_devuelve_la_grilla_completa_aunque_no_haya_datos(self):
        total = sum(len(r) for r in sync_state.PROVIDER_RESOURCES.values())
        with fake_db(rows=[[]]):
            estados = sync_state.list_states()
        self.assertEqual(len(estados), total)
        self.assertTrue(all(e["never_synced"] for e in estados))
        self.assertTrue(all(e["resource_label"] for e in estados))

    def test_marca_como_sincronizado_el_canal_con_historia(self):
        exito = sync_state._now() - timedelta(minutes=20)
        fila = {"provider": "mercadopago", "resource": "payments",
                "cursor_at": exito, "last_run_at": exito,
                "last_success_at": exito, "last_status": "success",
                "last_error": None, "last_items": 4, "last_trigger": "scheduler",
                "total_items": 120, "total_runs": 30, "consecutive_failures": 0}
        with fake_db(rows=[[fila]]):
            estados = sync_state.list_states()
        mp = next(e for e in estados if e["provider"] == "mercadopago")
        self.assertFalse(mp["never_synced"])
        self.assertEqual(mp["last_items"], 4)
        self.assertIsNotNone(mp["next_window_from"])
        # Los demás canales siguen apareciendo, sin sincronizar.
        self.assertTrue(any(e["never_synced"] for e in estados))

    def test_sin_tabla_devuelve_la_grilla_vacia_en_vez_de_romper(self):
        with fake_db(error=True):
            estados = sync_state.list_states()
            corridas = sync_state.list_runs()
        self.assertTrue(all(e["never_synced"] for e in estados))
        self.assertEqual(corridas, [])


class NormalizacionDeFechasTest(unittest.TestCase):
    def test_interpreta_una_cadena_iso_con_z(self):
        valor = sync_state._as_aware("2026-01-15T10:30:00Z")
        self.assertIsNotNone(valor)
        self.assertIsNotNone(valor.tzinfo)

    def test_le_pone_zona_a_un_datetime_sin_zona(self):
        valor = sync_state._as_aware(datetime(2026, 1, 15, 10, 30))
        self.assertIsNotNone(valor.tzinfo)

    def test_una_cadena_ilegible_no_rompe(self):
        self.assertIsNone(sync_state._as_aware("ayer a la tarde"))


class LimiteDeRecuperacionTest(unittest.TestCase):
    """El tope de registros tiene que acompañar al atraso real de la ventana;
    con el tope fijo de antes, un fin de semana caído se truncaba en silencio."""

    def _run_con_ventana(self, dias):
        ahora = sync_state._now()
        return sync_state.SyncRun("mercadolibre", "orders", "scheduler",
                                  ahora - timedelta(days=dias), ahora,
                                  enabled=False)

    def test_una_ventana_corta_usa_el_minimo(self):
        self.assertEqual(self._run_con_ventana(0.02).catch_up_limit(), 100)

    def test_el_atraso_sube_el_tope(self):
        self.assertGreater(self._run_con_ventana(3).catch_up_limit(),
                           self._run_con_ventana(1).catch_up_limit())

    def test_hay_un_techo(self):
        self.assertEqual(self._run_con_ventana(400).catch_up_limit(), 2000)

    def test_una_bajada_historica_sin_ventana_usa_el_minimo(self):
        ahora = sync_state._now()
        run = sync_state.SyncRun("mercadolibre", "orders", "manual", None, ahora,
                                 enabled=False)
        self.assertEqual(run.catch_up_limit(), 100)

    def test_respeta_los_topes_propios_de_cada_canal(self):
        # Tiendanube pagina distinto, así que el scheduler le pasa otros topes.
        run = self._run_con_ventana(30)
        self.assertEqual(run.catch_up_limit(base=50, per_day=150, cap=500), 500)


if __name__ == "__main__":
    unittest.main()
