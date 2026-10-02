import unittest
import json
from unittest.mock import patch, MagicMock
from src import database

class TestDashboardTopSelling(unittest.TestCase):

    @patch('src.database.get_connection')
    def test_top_selling_products_aggregation(self, mock_conn):
        mock_cursor = MagicMock()
        mock_conn.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock database fetch responses in sequence
        # 1. sales_row
        mock_sales_row = {'count': 3, 'total': 150000.0}
        # 2. incomes_row
        mock_incomes_row = {'total': 0.0}
        # 3. total_active_products
        mock_active_prods = {'count': 10}
        # 4. orders_items
        mock_orders_items = [
            # Mercado Libre sale
            {
                'source_platform': 'MERCADOLIBRE',
                'items_json': json.dumps([
                    {'id': 'MLA100', 'title': 'Sustrato Hidroponico', 'quantity': 5, 'price': 10000.0}
                ])
            },
            # Tienda Nube sale
            {
                'source_platform': 'TIENDANUBE',
                'items_json': json.dumps([
                    {'item_id': 'MLA100', 'title': 'Sustrato Hidroponico', 'quantity': 3, 'price': 10000.0},
                    {'item_id': 'TN200', 'title': 'Solucion Nutritiva', 'quantity': 2, 'price': 5000.0}
                ])
            },
            # Local Comercial sale
            {
                'source_platform': 'LOCAL',
                'items_json': json.dumps([
                    {'id': 'MLA100', 'title': 'Sustrato Hidroponico', 'quantity': 2, 'price': 9000.0},
                    {'id': 'LOC300', 'title': 'Bandeja Plastica', 'quantity': 4, 'price': 3000.0}
                ])
            }
        ]
        # 5. products_cache
        mock_all_prods = [
            {
                'ml_id': 'MLA100',
                'title': 'Sustrato Hidroponico',
                'thumbnail': 'http://image.com/sustrato.jpg',
                'available_quantity': 50,
                'cost_price': 4000.0,
                'cost_meli': 1500.0,
                'status': 'active',
                'permalink': 'http://articulo.mercadolibre.com.ar/MLA-100',
                'tn_id': None,
                'tn_variant_id': None
            },
            {
                'ml_id': 'TN200',
                'title': 'Solucion Nutritiva',
                'thumbnail': 'http://image.com/solucion.jpg',
                'available_quantity': 20,
                'cost_price': 2000.0,
                'cost_meli': 0.0,
                'status': 'active',
                'permalink': '',
                'tn_id': '200',
                'tn_variant_id': None
            }
        ]
        # 6. variable_expenses
        mock_var_exp = {'total': 10000.0}
        # 7. fixed_expenses
        mock_fixed_exp = {'total': 20000.0}
        # 8. low_stock_count
        mock_low_stock_count = {'count': 1}
        # 9. low_stock_products
        mock_low_stock_products = []
        # 10. visits_meli
        mock_visits_meli = {'meli': 100}
        # 11. web_visits_log count
        mock_web_visits_count = {'count': 50}
        # 12. all_prods for visits
        mock_all_prods_visits = [
            {'ml_id': 'MLA100', 'title': 'Sustrato Hidroponico', 'visits_meli': 100, 'visits_web': 50}
        ]
        # 13. visits_by_domain
        mock_domain_visits = [{'domain': 'hidroponiarosario.com', 'count': 50}]
        # 14. visits_by_country
        mock_country_visits = [{'country': 'Argentina', 'count': 50}]

        mock_cursor.fetchone.side_effect = [
            mock_sales_row,
            mock_incomes_row,
            mock_active_prods,
            mock_var_exp,
            mock_fixed_exp,
            mock_low_stock_count,
            mock_visits_meli,
            mock_web_visits_count
        ]

        mock_cursor.fetchall.side_effect = [
            mock_orders_items,
            mock_all_prods,
            mock_low_stock_products,
            mock_all_prods_visits,
            mock_domain_visits,
            mock_country_visits
        ]

        res = database.get_dashboard_metrics(period="total")

        self.assertIn('top_selling_products', res)
        top = res['top_selling_products']
        self.assertGreaterEqual(len(top), 1)

        # Check MLA100 product (sold across ML, TN, and Local)
        p1 = next((p for p in top if p['id'] == 'MLA100'), None)
        self.assertIsNotNone(p1)
        self.assertEqual(p1['total_qty'], 10) # 5 MeLi + 3 TN + 2 Local
        self.assertEqual(p1['meli_qty'], 5)
        self.assertEqual(p1['tn_qty'], 3)
        self.assertEqual(p1['local_qty'], 2)
        self.assertEqual(p1['total_revenue'], 98000.0) # 50000 + 30000 + 18000
        self.assertEqual(p1['meli_revenue'], 50000.0)
        self.assertEqual(p1['tn_revenue'], 30000.0)
        self.assertEqual(p1['local_revenue'], 18000.0)
        self.assertEqual(p1['thumbnail'], 'http://image.com/sustrato.jpg')
        self.assertEqual(p1['current_stock'], 50)

        # Check Local item
        loc_item = next((p for p in top if p['id'] == 'LOC300'), None)
        self.assertIsNotNone(loc_item)
        self.assertEqual(loc_item['local_qty'], 4)
        self.assertEqual(loc_item['meli_qty'], 0)
        self.assertEqual(loc_item['tn_qty'], 0)
        self.assertEqual(loc_item['local_revenue'], 12000.0)

if __name__ == '__main__':
    unittest.main()
