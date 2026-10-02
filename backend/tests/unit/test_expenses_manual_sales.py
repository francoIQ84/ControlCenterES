import unittest
from unittest.mock import patch, MagicMock
from src.api.expenses import get_financial_summary, get_expenses_sales, get_cashflow_forecast

class TestExpensesManualSales(unittest.TestCase):

    @patch('src.database.get_setting')
    @patch('src.config.get_user_id')
    @patch('src.database.get_connection')
    @patch('src.api.expenses.ensure_fixed_expenses_for_month')
    def test_get_financial_summary_includes_null_buyer_id_with_meli_id(self, mock_ensure_fixed, mock_conn, mock_meli_uid, mock_get_setting):
        mock_meli_uid.return_value = '12345678'
        mock_get_setting.return_value = ''

        mock_cursor = MagicMock()
        mock_conn.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock results for the queries executed in get_financial_summary:
        # 1. total_fixed
        # 2. total_variable
        # 3. total_transfers
        # 4. total_manual_incomes
        # 5. total_sales
        mock_cursor.fetchone.side_effect = [
            {'total': 10000.0},
            {'total': 5000.0},
            {'total': 0.0},
            {'total': 2000.0},
            {'total': 45000.0}
        ]

        current_user = {'username': 'test', 'role': 'admin'}
        res = get_financial_summary(month=9, year=2026, current_user=current_user)

        self.assertEqual(res['total_sales'], 45000.0)
        self.assertEqual(res['total_incomes'], 47000.0)

        # Inspect the 5th query executed (the sales query)
        sales_call = mock_cursor.execute.call_args_list[4]
        query_sql, params = sales_call[0]

        # Check that buyer_id IS NULL OR buyer_id::text != %s is present
        self.assertIn("buyer_id IS NULL OR buyer_id::text != %s", query_sql)
        self.assertIn('12345678', params)

    @patch('src.database.get_setting')
    @patch('src.config.get_user_id')
    @patch('src.database.get_connection')
    def test_get_expenses_sales_includes_null_buyer_id_with_meli_id(self, mock_conn, mock_meli_uid, mock_get_setting):
        mock_meli_uid.return_value = '12345678'
        mock_get_setting.return_value = ''

        mock_cursor = MagicMock()
        mock_conn.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = mock_cursor
        mock_cursor.fetchall.return_value = [
            {
                'order_id': 9999,
                'date_created': '2026-09-18 12:00:00',
                'buyer_name': 'Cliente Local',
                'buyer_nickname': 'cliente_local',
                'total_amount': 25000.0,
                'source_platform': 'LOCAL',
                'payment_method': 'Efectivo',
                'status': 'paid'
            }
        ]

        current_user = {'username': 'test', 'role': 'admin'}
        res = get_expenses_sales(month=9, year=2026, current_user=current_user)

        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['source_platform'], 'LOCAL')

        sales_call = mock_cursor.execute.call_args_list[0]
        query_sql, params = sales_call[0]
        self.assertIn("buyer_id IS NULL OR buyer_id::text != %s", query_sql)
        self.assertIn('12345678', params)

    @patch('src.database.get_setting')
    @patch('src.config.get_user_id')
    @patch('src.database.get_connection')
    @patch('src.api.expenses.ensure_fixed_expenses_for_month')
    def test_get_financial_forecast_includes_null_buyer_id_with_meli_id(self, mock_ensure_fixed, mock_conn, mock_meli_uid, mock_get_setting):
        mock_meli_uid.return_value = '12345678'
        mock_get_setting.return_value = ''

        mock_cursor = MagicMock()
        mock_conn.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = mock_cursor

        mock_cursor.fetchone.return_value = {'total': 10000.0, 'count': 1}

        current_user = {'username': 'test', 'role': 'admin'}
        res = get_cashflow_forecast(current_user=current_user)

        forecast_call = mock_cursor.execute.call_args_list[0]
        query_sql, params = forecast_call[0]
        self.assertIn("buyer_id IS NULL OR buyer_id::text != %s", query_sql)
        self.assertIn('12345678', params)


if __name__ == '__main__':
    unittest.main()
