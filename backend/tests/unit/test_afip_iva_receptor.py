import unittest
from unittest.mock import patch, MagicMock
from src.utils.afip_ws import resolve_condicion_iva_receptor_id, request_cae

class TestAfipIvaReceptor(unittest.TestCase):
    def test_resolve_consumidor_final(self):
        # DocTipo 99 or 96 or explicit string
        self.assertEqual(resolve_condicion_iva_receptor_id(99, "Consumidor Final", 11), 5)
        self.assertEqual(resolve_condicion_iva_receptor_id(96, None, 11), 5)
        self.assertEqual(resolve_condicion_iva_receptor_id(99, None, 6), 5)

    def test_resolve_responsable_inscripto(self):
        # CUIT with RI condition
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "Responsable Inscripto", 1), 1)
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "IVA Responsable Inscripto", 11), 1)
        self.assertEqual(resolve_condicion_iva_receptor_id(80, None, 1), 1)

    def test_resolve_monotributo(self):
        # CUIT with Monotributo condition
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "Responsable Monotributo", 11), 6)
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "Monotributo", 11), 6)
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "Monotributista Social", 11), 13)

    def test_resolve_exento(self):
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "IVA Sujeto Exento", 6), 4)
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "Exento", 11), 4)

    def test_compatibility_guards(self):
        # Factura A cannot be Consumidor Final (5) -> must guard to 1
        self.assertEqual(resolve_condicion_iva_receptor_id(99, "Consumidor Final", cbte_tipo=1), 1)
        # Factura B cannot be Responsable Inscripto (1) -> must guard to 5
        self.assertEqual(resolve_condicion_iva_receptor_id(80, "Responsable Inscripto", cbte_tipo=6), 5)

    @patch('src.utils.afip_ws.call_wsfe')
    def test_request_cae_includes_condicion_iva_receptor_tag(self, mock_call_wsfe):
        import xml.etree.ElementTree as ET
        mock_root = ET.fromstring('''<FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
            <FECAESolicitarResult>
                <Resultado>A</Resultado>
                <FeDetResp>
                    <FECAEDetResponse>
                        <CAE>12345678901234</CAE>
                        <CAEFchVto>20261231</CAEFchVto>
                    </FECAEDetResponse>
                </FeDetResp>
            </FECAESolicitarResult>
        </FECAESolicitarResponse>''')
        mock_call_wsfe.return_value = mock_root

        cae, exp = request_cae(
            token="test-token",
            sign="test-sign",
            cuit="20313832482",
            pto_vta=1,
            cbte_tipo=11,
            invoice_number=10,
            doc_tipo=99,
            doc_nro=0,
            amount=5000.0,
            env="homologacion",
            concept=1,
            condicion_iva_receptor_id=5
        )

        self.assertEqual(cae, "12345678901234")
        self.assertEqual(exp, "2026-12-31")

        # Verify SOAP payload sent to call_wsfe
        mock_call_wsfe.assert_called_once()
        action, body, env = mock_call_wsfe.call_args[0]
        self.assertEqual(action, "FECAESolicitar")
        self.assertIn("<CondicionIVAReceptorId>5</CondicionIVAReceptorId>", body)
        # Verify sequence: MonCotiz comes before CondicionIVAReceptorId
        self.assertTrue(body.index("<MonCotiz>1</MonCotiz>") < body.index("<CondicionIVAReceptorId>5</CondicionIVAReceptorId>"))

if __name__ == '__main__':
    unittest.main()
