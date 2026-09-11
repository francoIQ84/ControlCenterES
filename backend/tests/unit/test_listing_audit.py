"""Auditoría de calidad de publicaciones de Mercado Libre.

Confirmado contra la API real con la cuenta EXPERIENCIASUSTENTABLE:

  * La ruta oficial es /item/{id}/performance en SINGULAR: el plural devuelve
    "resource not found".
  * El viejo /items/{id}/health no aplica a productos, responde "Items with
    buying mode 'buy_it_now' are not allowed". Nunca fue el endpoint para esto.
  * /performance devuelve 403 en esta cuenta pese a tener token fresco y la
    aplicación scopes amplios. Por eso la estrategia por defecto es la local.
  * /items/{id} y /categories/{id}/attributes responden 200, que es sobre lo
    que se apoya la auditoría local.

PERFORMANCE_OK sigue siendo el ejemplo de la documentación, no una captura
real: cuando se habilite el recurso hay que reemplazarlo por una respuesta de
verdad y verificar que los tests sigan pasando.
"""
import json
import sys
import types
import unittest
from unittest.mock import patch

# El entorno de desarrollo no tiene salida a internet para instalar
# dependencias, asi que se stubea lo unico que falta en la cadena de imports.
try:  # pragma: no cover - depende del entorno
    import dotenv  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    _dotenv_stub = types.ModuleType('dotenv')
    _dotenv_stub.load_dotenv = lambda *args, **kwargs: False
    sys.modules['dotenv'] = _dotenv_stub

from src.utils import listing_audit_service as svc


PERFORMANCE_OK = {
    "entity_type": "ITEM",
    "entity_id": "MLA901348978",
    "score": 47,
    "level": "MEDIUM",
    "level_wording": "Puede mejorar",
    "calculated_at": "2026-09-10T12:00:00.000Z",
    "buckets": [
        {"id": "FICHA_TECNICA", "status": "PENDING", "score": 10,
         "variables": [{"id": "GTIN", "status": "PENDING"}]},
        {"id": "FOTOS", "status": "COMPLETED", "score": 15, "variables": []},
        {"id": "DESCRIPCION", "status": "PENDING", "score": 8, "variables": []},
        {"id": "ENVIO_GRATIS", "status": "PENDING", "score": 12, "variables": []},
    ],
}


class ParsePerformanceTest(unittest.TestCase):
    def test_extrae_puntaje_nivel_y_objetivos_pendientes(self):
        datos = svc.parse_performance(PERFORMANCE_OK)
        self.assertEqual(datos['score'], 47.0)
        self.assertEqual(datos['level'], 'MEDIUM')
        self.assertEqual(datos['calculated_at'], '2026-09-10T12:00:00.000Z')
        self.assertEqual(datos['pending_goals'], 3)
        self.assertEqual(
            datos['pending_codes'], ['FICHA_TECNICA', 'DESCRIPCION', 'ENVIO_GRATIS'])

    def test_guarda_los_buckets_crudos_para_poder_reparsear(self):
        datos = svc.parse_performance(PERFORMANCE_OK)
        self.assertEqual(json.loads(datos['goals_json']), PERFORMANCE_OK['buckets'])

    def test_no_rompe_con_campos_ausentes(self):
        """Un formato inesperado no puede tumbar la auditoria del resto."""
        for payload in ({}, {"score": None}, {"buckets": "no es una lista"}, None, []):
            datos = svc.parse_performance(payload)
            self.assertEqual(datos['pending_goals'], 0)
            self.assertIsNone(datos['score'])

    def test_solo_cuenta_pendientes_los_marcados_PENDING(self):
        """Un estado intermedio desconocido no se cuenta como pendiente."""
        payload = {"buckets": [
            {"id": "A", "status": "COMPLETED"},
            {"id": "B", "status": "pending"},     # distinta capitalizacion
            {"id": "C", "status": "IN_REVIEW"},   # estado que no conocemos
        ]}
        datos = svc.parse_performance(payload)
        self.assertEqual(datos['pending_goals'], 1)
        self.assertEqual(datos['pending_codes'], ['B'])


class FetchPerformanceTest(unittest.TestCase):
    def test_usa_la_ruta_en_singular(self):
        """/item/{id}/performance, no /items/: el plural no existe para este recurso."""
        class Resp:
            status_code = 200
            def json(self):
                return PERFORMANCE_OK

        with patch.object(svc.meli_api, 'is_demo_mode', return_value=False), \
             patch.object(svc.meli_api, 'api_request', return_value=Resp()) as req:
            payload, error = svc.fetch_performance('MLA901348978')

        self.assertIsNone(error)
        self.assertEqual(payload, PERFORMANCE_OK)
        req.assert_called_once_with('GET', '/item/MLA901348978/performance')

    def test_devuelve_el_error_de_meli_sin_lanzar(self):
        class Resp:
            status_code = 404
            text = 'Item not found'
            def json(self):
                return {}

        with patch.object(svc.meli_api, 'is_demo_mode', return_value=False), \
             patch.object(svc.meli_api, 'api_request', return_value=Resp()):
            payload, error = svc.fetch_performance('MLA000')

        self.assertIsNone(payload)
        self.assertIn('404', error)


class LocalAuditTest(unittest.TestCase):
    """Objetivos derivados por nosotros, sin el endpoint oficial de calidad."""

    CATALOGO = [
        {"id": "BRAND", "tags": {"required": None}},
        {"id": "MODEL", "tags": {"required": None}},
        {"id": "GTIN", "tags": {"catalog_required": None}},
        {"id": "UNITS_PER_PACK", "tags": {"conditional_required": None}},
        {"id": "VALUE_ADDED_TAX", "tags": {"conditional_required": None}},
        {"id": "IMPORT_DUTY", "tags": {"conditional_required": None}},
        {"id": "COLOR", "tags": {}},
    ]

    def _item(self, **cambios):
        base = {
            "id": "MLA1",
            "title": "Piedra Difusora Chica Por 2 Unidades. Aireadores.",
            "category_id": "MLA32248",
            "attributes": [
                {"id": "BRAND", "value_name": "Generica"},
                {"id": "MODEL", "value_name": "Chica"},
            ],
            "pictures": [{"id": "1"}, {"id": "2"}, {"id": "3"}],
            "_description": "x" * 500,
        }
        base.update(cambios)
        return base

    def _auditar(self, item, catalogo=None):
        datos = svc.compute_local_audit(
            item, self.CATALOGO if catalogo is None else catalogo)
        return datos, datos['pending_codes']

    def _detalle_ficha(self, datos):
        return json.loads(datos['goals_json'])[0]['detail']

    def test_publicacion_completa_no_tiene_objetivos_pendientes(self):
        item = self._item(attributes=[
            {"id": "BRAND", "value_name": "Generica"},
            {"id": "MODEL", "value_name": "Chica"},
            {"id": "GTIN", "value_name": "779000"},
            {"id": "UNITS_PER_PACK", "value_name": "2"},
        ])
        datos, pendientes = self._auditar(item)
        self.assertEqual(pendientes, [])
        self.assertEqual(datos['pending_goals'], 0)

    def test_detecta_ficha_tecnica_incompleta(self):
        datos, pendientes = self._auditar(self._item())
        self.assertIn('FICHA_TECNICA', pendientes)
        detalle = self._detalle_ficha(datos)
        self.assertEqual(detalle['faltan_condicionales'], ['GTIN', 'UNITS_PER_PACK'])
        self.assertEqual(detalle['cargados'], 2)
        self.assertEqual(detalle['total_catalogo'], 7)

    def test_los_atributos_fiscales_no_cuentan_como_objetivo(self):
        """VALUE_ADDED_TAX e IMPORT_DUTY faltan en casi toda publicacion local."""
        item = self._item(attributes=[
            {"id": "BRAND", "value_name": "Generica"},
            {"id": "MODEL", "value_name": "Chica"},
            {"id": "GTIN", "value_name": "779000"},
            {"id": "UNITS_PER_PACK", "value_name": "2"},
        ])
        datos, pendientes = self._auditar(item)
        self.assertNotIn('FICHA_TECNICA', pendientes)
        detalle = self._detalle_ficha(datos)
        self.assertEqual(sorted(detalle['faltan_fiscales']),
                         ['IMPORT_DUTY', 'VALUE_ADDED_TAX'])

    def test_detecta_pocas_fotos(self):
        """El caso real encontrado: una publicacion activa con una sola foto."""
        _datos, pendientes = self._auditar(self._item(pictures=[{"id": "1"}]))
        self.assertIn('FOTOS', pendientes)

    def test_detecta_descripcion_corta_o_ausente(self):
        _datos, pendientes = self._auditar(self._item(_description=''))
        self.assertIn('DESCRIPCION', pendientes)

    def test_un_atributo_con_valor_vacio_cuenta_como_no_cargado(self):
        item = self._item(attributes=[
            {"id": "BRAND", "value_name": ""},
            {"id": "MODEL", "value_name": None, "value_id": None},
        ])
        datos, _pendientes = self._auditar(item)
        detalle = self._detalle_ficha(datos)
        self.assertEqual(sorted(detalle['faltan_requeridos']), ['BRAND', 'MODEL'])

    def test_no_inventa_un_puntaje(self):
        """Un 0-100 propio se confundiria con el de ML y no coincidiria con el."""
        datos, _pendientes = self._auditar(self._item())
        self.assertIsNone(datos['score'])
        self.assertEqual(datos['level'], 'LOCAL')

    def test_sin_catalogo_igual_audita_lo_demas(self):
        """Si falla /categories, fotos, titulo y descripcion se siguen evaluando."""
        _datos, pendientes = self._auditar(self._item(pictures=[]), catalogo=[])
        self.assertIn('FOTOS', pendientes)
        self.assertNotIn('FICHA_TECNICA', pendientes)

    def test_no_rompe_con_entradas_invalidas(self):
        for item, catalogo in ((None, None), ({}, []), ("no es dict", "no es lista")):
            datos = svc.compute_local_audit(item, catalogo)
            self.assertIsInstance(datos['pending_goals'], int)


class AuditListingsTest(unittest.TestCase):
    def _audit(self, ids, fetch_side_effect, ages=None, **kwargs):
        """Ejercita la orquestacion sobre la estrategia oficial."""
        kwargs.setdefault('strategy', 'performance')
        guardados = []
        with patch.object(svc.database, 'get_listing_health_ages', return_value=ages or {}), \
             patch.object(svc.database, 'save_listing_health',
                          side_effect=lambda ml_id, h: guardados.append(ml_id)), \
             patch.object(svc, 'fetch_performance', side_effect=fetch_side_effect) as fetch, \
             patch.object(svc, 'PAUSE_BETWEEN_CALLS', 0), \
             patch.object(svc, 'update_progress'):
            resultados = svc.audit_listings(ids, **kwargs)
        return resultados, guardados, fetch

    def test_la_estrategia_por_defecto_es_la_local(self):
        """El endpoint oficial devuelve 403 en esta cuenta: no se usa por defecto."""
        with patch.object(svc.database, 'get_listing_health_ages', return_value={}), \
             patch.object(svc.database, 'save_listing_health'), \
             patch.object(svc, '_fetch_local',
                          return_value=({'item': {}, 'catalogo': []}, None)) as local, \
             patch.object(svc, 'fetch_performance') as oficial, \
             patch.object(svc, 'PAUSE_BETWEEN_CALLS', 0), \
             patch.object(svc, 'update_progress'):
            svc.audit_listings(['MLA1'])

        local.assert_called_once()
        oficial.assert_not_called()

    def test_una_sola_publicacion_hace_una_sola_llamada(self):
        """El requisito: probar la herramienta con una publicacion es una lista de uno."""
        resultados, guardados, fetch = self._audit(
            ['MLA901348978'], lambda ml_id: (PERFORMANCE_OK, None))

        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(guardados, ['MLA901348978'])
        self.assertEqual(resultados[0]['status'], 'ok')
        self.assertEqual(resultados[0]['score'], 47.0)
        self.assertEqual(resultados[0]['pending_goals'], 3)

    def test_un_fallo_no_interrumpe_las_demas(self):
        def fetch(ml_id):
            if ml_id == 'MLA_ROTA':
                return None, 'HTTP 500: boom'
            return PERFORMANCE_OK, None

        resultados, guardados, _fetch = self._audit(['MLA_A', 'MLA_ROTA', 'MLA_B'], fetch)

        estados = {r['ml_id']: r['status'] for r in resultados}
        self.assertEqual(estados, {'MLA_A': 'ok', 'MLA_ROTA': 'error', 'MLA_B': 'ok'})
        self.assertEqual(guardados, ['MLA_A', 'MLA_B'])

    def test_no_reconsulta_lo_que_esta_fresco(self):
        resultados, _guardados, fetch = self._audit(
            ['MLA_FRESCA', 'MLA_VIEJA'],
            lambda ml_id: (PERFORMANCE_OK, None),
            ages={'MLA_FRESCA': 1.0, 'MLA_VIEJA': 48.0},
            max_age_hours=12,
        )

        estados = {r['ml_id']: r['status'] for r in resultados}
        self.assertEqual(estados['MLA_FRESCA'], 'cached')
        self.assertEqual(estados['MLA_VIEJA'], 'ok')
        self.assertEqual(fetch.call_count, 1)

    def test_force_refresh_ignora_el_cache(self):
        _resultados, _guardados, fetch = self._audit(
            ['MLA_FRESCA'],
            lambda ml_id: (PERFORMANCE_OK, None),
            ages={'MLA_FRESCA': 1.0},
            force_refresh=True,
        )
        self.assertEqual(fetch.call_count, 1)

    def test_ignora_duplicados_y_vacios(self):
        _resultados, _guardados, fetch = self._audit(
            ['MLA_A', ' MLA_A ', '', None, 'MLA_B'],
            lambda ml_id: (PERFORMANCE_OK, None))
        self.assertEqual(fetch.call_count, 2)

    def test_un_403_corta_la_auditoria_en_seco(self):
        """Un problema de permisos es de la cuenta: repetirlo 400 veces no aporta."""
        resultados, guardados, fetch = self._audit(
            ['MLA_A', 'MLA_B', 'MLA_C'],
            lambda ml_id: (None, 'HTTP 403: forbidden'))

        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(guardados, [])
        self.assertEqual([r['status'] for r in resultados],
                         ['error', 'skipped', 'skipped'])

    def test_un_404_no_corta_la_auditoria(self):
        """Una publicacion inexistente es un problema de ella, no de la cuenta."""
        def fetch(ml_id):
            if ml_id == 'MLA_B':
                return None, 'HTTP 404: not found'
            return PERFORMANCE_OK, None

        resultados, guardados, f = self._audit(['MLA_A', 'MLA_B', 'MLA_C'], fetch)
        self.assertEqual(f.call_count, 3)
        self.assertEqual(guardados, ['MLA_A', 'MLA_C'])
        self.assertEqual([r['status'] for r in resultados], ['ok', 'error', 'ok'])

    def test_sin_seleccion_no_hace_nada(self):
        """Nunca opera sobre "todo el catalogo" por su cuenta."""
        _resultados, _guardados, fetch = self._audit(
            [], lambda ml_id: (PERFORMANCE_OK, None))
        self.assertEqual(fetch.call_count, 0)


if __name__ == '__main__':
    unittest.main()
