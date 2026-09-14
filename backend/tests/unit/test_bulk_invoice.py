import unittest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from src.api.sales import bulk_invoice_endpoint, BulkInvoiceRequest

class TestBulkInvoice(unittest.TestCase):

    def test_empty_order_ids_raises_400(self):
        req = BulkInvoiceRequest(order_ids=[])
        with self.assertRaises(HTTPException) as ctx:
            bulk_invoice_endpoint(req)
        self.assertEqual(ctx.exception.status_code, 400)

    @patch('src.database.get_order_by_id')
    @patch('src.utils.afip_ws.create_invoice')
    def test_bulk_invoice_mixed_orders(self, mock_create_inv, mock_get_order):
        # Order 101: Already invoiced
        order_101 = {
            'order_id': 101,
            'buyer_name': 'Cliente Uno',
            'total_amount': 15000,
            'invoice_generated': 1,
            'invoice_number': '0001-00000010',
            'afip_cae': '71234567890123'
        }
        # Order 102: New order, succeeds
        order_102 = {
            'order_id': 102,
            'buyer_name': 'Cliente Dos',
            'total_amount': 25000,
            'invoice_generated': 0,
            'invoice_number': None,
            'afip_cae': None,
            'items': [{'title': 'Producto 1', 'quantity': 1, 'price': 25000}],
            'source_platform': 'LOCAL'
        }
        # Order 103: Order not found
        # (mock_get_order will return None for 103)

        def side_get_order(order_id):
            if order_id == 101:
                return dict(order_101)
            elif order_id == 102:
                return dict(order_102)
            return None

        mock_get_order.side_effect = side_get_order
        mock_create_inv.return_value = {
            'success': True,
            'invoice_number': '0001-00000011',
            'cae': '76543210987654',
            'cae_exp': '2026-09-20'
        }

        req = BulkInvoiceRequest(order_ids=[101, 102, 103], doc_type='99', include_shipping=True)
        response = bulk_invoice_endpoint(req)

        self.assertEqual(response['total'], 3)
        self.assertEqual(response['success_count'], 2) # 101 (already invoiced) + 102 (newly invoiced)
        self.assertEqual(response['error_count'], 1)   # 103 (not found)

        # Check order 101
        res_101 = next(r for r in response['results'] if r['order_id'] == 101)
        self.assertTrue(res_101['success'])
        self.assertTrue(res_101.get('already_invoiced'))

        # Check order 102
        res_102 = next(r for r in response['results'] if r['order_id'] == 102)
        self.assertTrue(res_102['success'])
        self.assertEqual(res_102['invoice_number'], '0001-00000011')
        self.assertEqual(res_102['cae'], '76543210987654')

        # Check order 103
        res_103 = next(r for r in response['results'] if r['order_id'] == 103)
        self.assertFalse(res_103['success'])
        self.assertIn('no encontrado', res_103['error'])

        # Verify create_invoice was called once (for order 102) with Consumidor Final
        mock_create_inv.assert_called_once()
        passed_order = mock_create_inv.call_args[0][0]
        self.assertEqual(passed_order['buyer']['name'], 'Cliente Dos')
        self.assertEqual(passed_order['buyer']['iva_condition'], 'Consumidor Final')
        self.assertEqual(passed_order['buyer']['document_number'], '')

if __name__ == '__main__':
    unittest.main()
