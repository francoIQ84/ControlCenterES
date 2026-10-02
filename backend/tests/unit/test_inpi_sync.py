"""
Tests unitarios de la sincronización periódica y diaria de Propiedad Industrial (INPI Argentina).
Verifica compatibilidad multi-tenant, throttle de 24 horas y actualización de todos los tipos de activos
(marcas, patentes de invención, modelos de utilidad y diseños industriales).
"""

import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

from src.api import inpi


class InpiSyncDueCheckTest(unittest.TestCase):
    def test_sin_activos_no_hace_nada(self):
        with patch("src.database.get_all_monitored_trademarks", return_value=[]):
            res = inpi.check_and_sync_ip_assets_if_due({"slug": "test_tenant"})
        self.assertFalse(res["synced"])
        self.assertEqual(res["reason"], "no_assets")

    def test_omite_si_ya_sincronizo_recientemente_mismo_dia(self):
        recent_time = (datetime.now() - timedelta(hours=3)).isoformat()
        with patch("src.database.get_all_monitored_trademarks", return_value=[{"acta": "123", "asset_type": "marca"}]), \
             patch("src.database.get_setting", side_effect=lambda k, default="": recent_time if k == "inpi_last_synced_at" else default), \
             patch.object(inpi, "sync_monitored_trademarks") as mock_sync:
            res = inpi.check_and_sync_ip_assets_if_due({"slug": "test_tenant"})
        self.assertFalse(res["synced"])
        self.assertEqual(res["reason"], "already_synced_recently")
        mock_sync.assert_not_called()

    def test_ejecuta_si_cambio_el_dia_calendario(self):
        yesterday_time = (datetime.now() - timedelta(days=1, hours=2)).isoformat()
        with patch("src.database.get_all_monitored_trademarks", return_value=[{"acta": "123", "asset_type": "marca"}]), \
             patch("src.database.get_setting", side_effect=lambda k, default="": yesterday_time if k == "inpi_last_synced_at" else default), \
             patch.object(inpi, "sync_monitored_trademarks", return_value={"success": True, "updated_count": 1, "last_synced_at": datetime.now().isoformat()}):
            res = inpi.check_and_sync_ip_assets_if_due({"slug": "test_tenant"})
        self.assertTrue(res["synced"])
        self.assertEqual(res["updated_count"], 1)

    def test_ejecuta_si_transcurrio_el_intervalo_24_horas(self):
        twenty_five_hours_ago = (datetime.now() - timedelta(hours=25)).isoformat()
        with patch("src.database.get_all_monitored_trademarks", return_value=[{"acta": "123", "asset_type": "marca"}]), \
             patch("src.database.get_setting", side_effect=lambda k, default="": twenty_five_hours_ago if k == "inpi_last_synced_at" else default), \
             patch.object(inpi, "sync_monitored_trademarks", return_value={"success": True, "updated_count": 2, "last_synced_at": datetime.now().isoformat()}):
            res = inpi.check_and_sync_ip_assets_if_due({"slug": "test_tenant"})
        self.assertTrue(res["synced"])
        self.assertEqual(res["updated_count"], 2)


class InpiSyncMultiAssetTest(unittest.TestCase):
    @patch("src.database.set_setting")
    @patch("src.database.update_monitored_trademark_data")
    @patch("src.database.update_monitored_trademark")
    @patch.object(inpi, "_call_soap_action")
    @patch.object(inpi, "_fetch_inpi_modelo")
    @patch.object(inpi, "_fetch_patent_data")
    def test_sync_todos_los_tipos_de_activos(self, mock_fetch_patent, mock_fetch_modelo, mock_soap, mock_update_tm, mock_update_data, mock_set_setting):
        assets = [
            {"acta": "3991934", "denominacion": "GREEN ORBITAL", "asset_type": "marca", "fecha_ingreso": "2020-01-01"},
            {"acta": "99822", "denominacion": "Maceta hidropónica", "asset_type": "diseno_industrial", "fecha_ingreso": "2021-07-27"},
            {"acta": "AR123630A1", "denominacion": "Dispositivo rectificador", "asset_type": "patente", "fecha_ingreso": "2021-09-28"},
            {"acta": "AR555U1", "denominacion": "Válvula mejorada", "asset_type": "modelo_utilidad", "fecha_ingreso": "2022-03-15"}
        ]

        # Simular SOAP para Marca
        mock_soap.return_value = """<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <ConsultaDenominacionResponse xmlns="http://tempuri.org/">
              <ConsultaDenominacionResult>
                <GrillaMarcas>
                  <Acta>3991934</Acta>
                  <Denominacion>GREEN ORBITAL</Denominacion>
                  <Estado>CONCEDIDA</Estado>
                  <Numero_Resolucion>3317684</Numero_Resolucion>
                  <Fecha_Ingreso>2020-01-01T00:00:00</Fecha_Ingreso>
                </GrillaMarcas>
              </ConsultaDenominacionResult>
            </ConsultaDenominacionResponse>
          </soap:Body>
        </soap:Envelope>"""

        # Simular Diseño
        mock_fetch_modelo.return_value = {
            "acta": "99822",
            "denominacion": "Maceta hidropónica",
            "estado": "Concedida",
            "fecha_concesion": "27/07/2021",
            "asset_type": "diseno_industrial"
        }

        # Simular Patente y Modelo
        mock_fetch_patent.side_effect = [
            {
                "acta": "AR123630A1",
                "denominacion": "Dispositivo rectificador",
                "estado": "Concedida / Publicada",
                "asset_type": "patente"
            },
            {
                "acta": "AR555U1",
                "denominacion": "Válvula mejorada",
                "estado": "Concedida / Publicada",
                "asset_type": "modelo_utilidad"
            }
        ]

        with patch("src.database.get_all_monitored_trademarks", return_value=assets):
            res = inpi.sync_monitored_trademarks()

        self.assertTrue(res["success"])
        self.assertEqual(res["total_monitored"], 4)
        self.assertEqual(res["updated_count"], 4)
        self.assertTrue(mock_update_data.called)
        self.assertEqual(mock_update_tm.call_count, 3) # diseno + patente + modelo_utilidad
        mock_set_setting.assert_called_with("inpi_last_synced_at", unittest.mock.ANY)

    @patch("src.database.set_setting")
    @patch("src.database.update_monitored_trademark_data")
    @patch("src.database.update_monitored_trademark")
    @patch.object(inpi, "_call_soap_action", side_effect=Exception("SOAP Timeout 504"))
    @patch.object(inpi, "_fetch_inpi_modelo", side_effect=Exception("Portal unavailable"))
    @patch.object(inpi, "_fetch_patent_data", side_effect=Exception("Espacenet network down"))
    def test_sync_fallback_local_recalcula_plazos_si_red_falla(self, mock_fetch_patent, mock_fetch_modelo, mock_soap, mock_update_tm, mock_update_data, mock_set_setting):
        """Si los servicios externos no responden, debe recalcular localmente los plazos y alertas para la fecha de hoy sin fallar."""
        assets = [
            {"acta": "3991934", "denominacion": "GREEN ORBITAL", "asset_type": "marca", "fecha_ingreso": "2018-05-10", "estado": "CONCEDIDA"},
            {"acta": "99822", "denominacion": "Maceta", "asset_type": "diseno_industrial", "fecha_ingreso": "2021-07-27", "estado": "Concedida", "quinquenio_actual": 1}
        ]

        with patch("src.database.get_all_monitored_trademarks", return_value=assets):
            res = inpi.sync_monitored_trademarks()

        self.assertTrue(res["success"])
        self.assertEqual(res["updated_count"], 2)
        # Verifica que se hayan recalculado localmente
        self.assertTrue(mock_update_data.called)
        self.assertTrue(mock_update_tm.called)
        mock_set_setting.assert_called_with("inpi_last_synced_at", unittest.mock.ANY)


if __name__ == "__main__":
    unittest.main()
