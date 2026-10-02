import unittest
from unittest.mock import patch, MagicMock
from src.api.inpi import _fetch_patent_data, consulta_patente

class TestInpiPatents(unittest.TestCase):

    def test_consulta_patente_empty(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            consulta_patente(query="")

    @patch('src.api.inpi._fetch_patent_data')
    def test_consulta_patente_found_mock(self, mock_fetch):
        mock_fetch.return_value = {
            'found': True,
            'source': 'Google Patents / Espacenet AR',
            'asset_type': 'patente',
            'acta': 'AR123630A1',
            'solicitud': 'P210102691A',
            'denominacion': 'Dispositivo rectificador del perfil del surco',
            'titulares': 'Plantium S A',
            'fecha_ingreso': '2021-09-28',
            'fecha_concesion': '2022-12-28'
        }

        res = consulta_patente(query="AR123630A1")
        self.assertTrue(res['success'])
        self.assertTrue(res['found'])
        self.assertEqual(res['result']['acta'], 'AR123630A1')
        self.assertEqual(res['result']['asset_type'], 'patente')
        self.assertIn('fecha_vencimiento_final', res['result'])

    @patch('src.api.inpi._fetch_patent_data')
    @patch('src.api.inpi._fetch_inpi_modelo')
    def test_consulta_patente_unindexed_allows_single_field(self, mock_modelo, mock_patent):
        mock_patent.return_value = None
        mock_modelo.return_value = None

        res = consulta_patente(query="AR999999Z9")
        self.assertTrue(res['success'])
        self.assertFalse(res['found'])
        self.assertEqual(res['result']['acta'], 'AR999999Z9')
        self.assertTrue(res['result']['denominacion'].startswith('Trámite / Solicitud'))

if __name__ == '__main__':
    unittest.main()
