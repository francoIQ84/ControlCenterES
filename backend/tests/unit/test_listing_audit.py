"""Auditoría de calidad de publicaciones de Mercado Libre.

El parseo es la única pieza acoplada al formato de ML, así que se testea
aparte con respuestas de ejemplo.

Confirmado contra la API real: la ruta es /item/{id}/performance en SINGULAR
(el plural devuelve "resource not found") y el viejo /items/{id}/health no
aplica a productos, responde "Items with buying mode 'buy_it_now' are not
allowed".

Lo que NO se pudo confirmar todavía: la forma del cuerpo. La cuenta devuelve
403 en ese recurso, así que PERFORMANCE_OK sigue siendo el ejemplo de la
documentación. Cuando se resuelva el permiso hay que reemplazarlo por una
captura real y verificar que los tests sigan pasando.
"""
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
        import json
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
            def json(self): return PERFORMANCE_OK

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
            def json(self): return {}

        with patch.object(svc.meli_api, 'is_demo_mode', return_value=False), \
             patch.object(svc.meli_api, 'api_request', return_value=Resp()):
            payload, error = svc.fetch_performance('MLA000')

        self.assertIsNone(payload)
        self.assertIn('404', error)


class AuditListingsTest(unittest.TestCase):
    def _audit(self, ids, fetch_side_effect, ages=None, **kwargs):
        guardados = []
        with patch.object(svc.database, 'get_listing_health_ages', return_value=ages or {}), \
             patch.object(svc.database, 'save_listing_health',
                          side_effect=lambda ml_id, h: guardados.append(ml_id)), \
             patch.object(svc, 'fetch_performance', side_effect=fetch_side_effect) as fetch, \
             patch.object(svc, 'PAUSE_BETWEEN_CALLS', 0), \
             patch.object(svc, 'update_progress'):
            resultados = svc.audit_listings(ids, **kwargs)
        return resultados, guardados, fetch

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

        resultados, guardados, _ = self._audit(['MLA_A', 'MLA_ROTA', 'MLA_B'], fetch)

        estados = {r['ml_id']: r['status'] for r in resultados}
        self.assertEqual(estados, {'MLA_A': 'ok', 'MLA_ROTA': 'error', 'MLA_B': 'ok'})
        self.assertEqual(guardados, ['MLA_A', 'MLA_B'])

    def test_no_reconsulta_lo_que_esta_fresco(self):
        resultados, guardados, fetch = self._audit(
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
        estados = [r['status'] for r in resultados]
        self.assertEqual(estados, ['error', 'skipped', 'skipped'])

    def test_un_404_no_corta_la_auditoria(self):
        """Una publicacion que no existe es un problema de esa publicacion, no de la cuenta."""
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
        _resultados, _guardados, fetch = self._audit([], lambda ml_id: (PERFORMANCE_OK, None))
        self.assertEqual(fetch.call_count, 0)


if __name__ == '__main__':
    unittest.main()
