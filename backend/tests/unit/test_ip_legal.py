import unittest
from datetime import datetime, timedelta
from src.utils import ip_legal

class TestIPLegal(unittest.TestCase):
    def test_trademark_legal_status(self):
        # Concedida en 2018 (ingreso 2017) -> DJUMT en 2023-2024 -> En mora hoy (2026)
        data = {
            'acta': '3853395',
            'denominacion': 'HIDROPONIA ROSARIO',
            'estado': 'CONCEDIDA',
            'fecha_ingreso': '2017-05-10',
            'asset_type': 'marca'
        }
        res = ip_legal.enrich_ip_asset_data(data)
        self.assertEqual(res['asset_type'], 'marca')
        self.assertTrue(res['requiere_djumt'])
        self.assertEqual(res['djumt_codigo'], 'EN_MORA')

    def test_patent_20_years_and_annuities(self):
        # Patente presentada hace 4 años: debe tener anualidades a partir del año 3
        now = datetime.now()
        ingreso_4y_ago = (now - timedelta(days=365 * 4)).strftime('%Y-%m-%d')
        data = {
            'acta': 'AR-P-12345',
            'denominacion': 'Sistema Automatizado de Dosificación Nutritiva',
            'fecha_ingreso': ingreso_4y_ago,
            'anualidades_pagadas': 3,
            'asset_type': 'patente'
        }
        res = ip_legal.enrich_ip_asset_data(data)
        self.assertEqual(res['asset_type'], 'patente')
        self.assertEqual(res['proxima_anualidad'], 4)
        # Vencimiento a 20 años desde ingreso
        dt_venc = datetime.strptime(res['fecha_vencimiento_final'], '%d/%m/%Y')
        dt_ing = datetime.strptime(ingreso_4y_ago, '%Y-%m-%d')
        self.assertEqual(dt_venc.year, dt_ing.year + 20)

    def test_utility_model_10_years(self):
        now = datetime.now()
        ingreso_2y_ago = (now - timedelta(days=365 * 2)).strftime('%Y-%m-%d')
        data = {
            'acta': 'AR-MU-999',
            'denominacion': 'Perfil de Cultivo con Canales Autolimpiantes',
            'fecha_ingreso': ingreso_2y_ago,
            'asset_type': 'modelo_utilidad'
        }
        res = ip_legal.enrich_ip_asset_data(data)
        self.assertEqual(res['asset_type'], 'modelo_utilidad')
        self.assertEqual(res['proxima_anualidad'], 3)
        dt_venc = datetime.strptime(res['fecha_vencimiento_final'], '%d/%m/%Y')
        dt_ing = datetime.strptime(ingreso_2y_ago, '%Y-%m-%d')
        self.assertEqual(dt_venc.year, dt_ing.year + 10)

    def test_industrial_design_quinquennium(self):
        # Diseño en 1° quinquenio, presentado hace 4.7 años (a 100 días de vencer los 5 años)
        now = datetime.now()
        ingreso_close_to_5 = (now - timedelta(days=365 * 4 + 250)).strftime('%Y-%m-%d')
        data = {
            'acta': 'AR-DI-555',
            'denominacion': 'Lámpara LED Hexagonal para Cultivo',
            'fecha_ingreso': ingreso_close_to_5,
            'quinquenio_actual': 1,
            'asset_type': 'diseno_industrial'
        }
        res = ip_legal.enrich_ip_asset_data(data)
        self.assertEqual(res['asset_type'], 'diseno_industrial')
        self.assertEqual(res['quinquenio_actual'], 1)
        # Debe estar en ventana de renovación (menos de 180 días)
        self.assertEqual(res['alerta_estado'], 'PRESENTAR_AHORA')
        self.assertIn('VENTANA DE RENOVACIÓN', res['alerta_mensaje'])

if __name__ == '__main__':
    unittest.main()
