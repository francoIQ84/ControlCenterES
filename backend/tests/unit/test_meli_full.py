import unittest
from unittest.mock import patch, MagicMock
from src import database, meli_api

class TestMeliFull(unittest.TestCase):
    def setUp(self):
        database.init_db()

    def test_save_and_retrieve_full_product(self):
        test_prod = [{
            'ml_id': 'MLA999888777',
            'title': 'Producto Test Full',
            'price': 25000.0,
            'cost_meli': 3500.0,
            'available_quantity': 15,
            'permalink': 'https://articulo.mercadolibre.com.ar/MLA-999888777',
            'thumbnail': 'https://placehold.co/100',
            'status': 'active',
            'logistic_type': 'fulfillment',
            'is_full': 1
        }]
        database.save_products(test_prod)

        prod = database.get_product_by_ml_id('MLA999888777')
        self.assertIsNotNone(prod)
        self.assertEqual(prod.get('is_full'), 1)
        self.assertEqual(prod.get('logistic_type'), 'fulfillment')

    def test_update_product_logistic_type(self):
        test_prod = [{
            'ml_id': 'MLA111222333',
            'title': 'Producto Test Toggle',
            'price': 10000.0,
            'cost_meli': 1500.0,
            'available_quantity': 5,
            'status': 'active',
            'logistic_type': 'drop_off',
            'is_full': 0
        }]
        database.save_products(test_prod)

        # Toggle to Full
        database.update_product_logistic_type('MLA111222333', 'fulfillment', 1)
        prod = database.get_product_by_ml_id('MLA111222333')
        self.assertEqual(prod.get('is_full'), 1)
        self.assertEqual(prod.get('logistic_type'), 'fulfillment')

        # Toggle back to normal
        database.update_product_logistic_type('MLA111222333', 'drop_off', 0)
        prod2 = database.get_product_by_ml_id('MLA111222333')
        self.assertEqual(prod2.get('is_full'), 0)

    def test_bulk_update_products_full(self):
        test_prods = [
            {'ml_id': 'MLA555001', 'title': 'P1', 'price': 5000.0, 'available_quantity': 2, 'status': 'active'},
            {'ml_id': 'MLA555002', 'title': 'P2', 'price': 8000.0, 'available_quantity': 4, 'status': 'active'},
        ]
        database.save_products(test_prods)

        database.bulk_update_products_full(['MLA555001', 'MLA555002'], 1)
        p1 = database.get_product_by_ml_id('MLA555001')
        p2 = database.get_product_by_ml_id('MLA555002')
        self.assertEqual(p1.get('is_full'), 1)
        self.assertEqual(p2.get('is_full'), 1)

    def test_update_stock_and_price_for_full_item(self):
        # Insert a full product
        database.save_products([{
            'ml_id': 'MLA888999000',
            'title': 'Full Item Api Test',
            'price': 12000.0,
            'available_quantity': 10,
            'status': 'active',
            'logistic_type': 'fulfillment',
            'is_full': 1
        }])

        with patch('src.meli_api.is_demo_mode', return_value=False), \
             patch('src.meli_api.api_request') as mock_api:
            mock_res = MagicMock()
            mock_res.status_code = 200
            mock_api.return_value = mock_res

            ok, msg = meli_api.update_stock_and_price('MLA888999000', 99, 13500.0)
            self.assertTrue(ok)
            # Ensure api_request was called with ONLY price, NOT available_quantity
            mock_api.assert_called_once()
            _, kwargs = mock_api.call_args
            json_data = kwargs.get('json_data', {})
            self.assertIn('price', json_data)
            self.assertNotIn('available_quantity', json_data)
            self.assertEqual(json_data['price'], 13500.0)

    def test_sync_full_status_demo(self):
        with patch('src.meli_api.is_demo_mode', return_value=True):
            ok, msg = meli_api.sync_full_status()
            self.assertTrue(ok)
            self.assertIn("Modo Demo", msg)

if __name__ == '__main__':
    unittest.main()
