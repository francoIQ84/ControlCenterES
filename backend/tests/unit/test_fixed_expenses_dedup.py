import unittest
from unittest.mock import MagicMock, patch
from src.api.expenses import cleanup_duplicate_fixed_expenses, ensure_fixed_expenses_for_month

class TestFixedExpensesDedup(unittest.TestCase):

    def test_cleanup_duplicate_fixed_expenses_executes_delete_query(self):
        mock_cursor = MagicMock()
        cleanup_duplicate_fixed_expenses(mock_cursor, month=10, year=2026)
        self.assertTrue(mock_cursor.execute.called)
        query = mock_cursor.execute.call_args[0][0]
        self.assertIn("ROW_NUMBER() OVER", query)
        self.assertIn("PARTITION BY month, year, LOWER(TRIM(description)), category", query)
        self.assertIn("WHERE sub.rn > 1", query)

    @patch('src.tenancy.get_current_tenant_id', return_value='00000000-0000-0000-0000-000000000001')
    def test_ensure_fixed_expenses_already_populated(self, mock_tenant):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock count > 0 (already populated)
        mock_cursor.fetchone.return_value = {'count': 5}

        ensure_fixed_expenses_for_month(mock_conn, 10, 2026)

        # Verify advisory lock was acquired and released
        self.assertTrue(any("pg_advisory_lock" in str(call) for call in mock_cursor.execute.call_args_list))
        self.assertTrue(any("pg_advisory_unlock" in str(call) for call in mock_cursor.execute.call_args_list))

        # Verify no inserts were attempted
        insert_calls = [call for call in mock_cursor.execute.call_args_list if "INSERT INTO fixed_expenses" in str(call)]
        self.assertEqual(len(insert_calls), 0)

    @patch('src.tenancy.get_current_tenant_id', return_value='00000000-0000-0000-0000-000000000001')
    def test_ensure_fixed_expenses_copies_with_deduplication(self, mock_tenant):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # 1. count check -> 0 (empty month)
        # 2. find prev month -> month 9, year 2026
        mock_cursor.fetchone.side_effect = [
            {'count': 0},
            {'month': 9, 'year': 2026}
        ]

        # 3. fetch prev expenses -> returns list
        mock_cursor.fetchall.return_value = [
            {'description': 'API', 'amount': 4145.23, 'category': 'Impuestos'},
            {'description': 'Sueldos', 'amount': 530000.0, 'category': 'Sueldos'}
        ]

        ensure_fixed_expenses_for_month(mock_conn, 10, 2026)

        # Verify DISTINCT ON is used when selecting from previous month
        select_prev_call = [call for call in mock_cursor.execute.call_args_list if "SELECT DISTINCT ON" in str(call)]
        self.assertTrue(len(select_prev_call) > 0)

        # Verify WHERE NOT EXISTS is used on inserts
        insert_calls = [call for call in mock_cursor.execute.call_args_list if "WHERE NOT EXISTS" in str(call)]
        self.assertEqual(len(insert_calls), 2)

if __name__ == '__main__':
    unittest.main()
