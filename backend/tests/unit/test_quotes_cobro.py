import unittest
import sys
import os

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from unittest.mock import patch, MagicMock
from src.api.quotes import convert_quote_to_sale_order, QuoteConvertRequest


class QuotesCobroUnitTest(unittest.TestCase):

    @patch("src.database.get_quote_by_id")
    @patch("src.database.create_manual_order")
    @patch("src.database.mark_quote_completed")
    @patch("src.database.get_product_by_id")
    @patch("src.database.deduct_product_stock_by_ml_id")
    def test_convert_quote_cash_creates_new_order(
        self, mock_deduct, mock_get_prod, mock_mark_done, mock_create_order, mock_get_quote
    ):
        mock_get_quote.return_value = {
            "id": 10,
            "quote_number": "PRES-2026-0002",
            "customer_name": "Dario",
            "customer_doc": "3382672660",
            "status": "pending",
            "total_amount": 98400.0,
            "items": [
                {"id": "PROD-1", "title": "Batería 12V", "quantity": 1, "price": 98400.0}
            ]
        }
        mock_get_prod.return_value = {"cost_price": 50000.0, "status": "active", "sync_meli": 0}
        mock_deduct.return_value = (True, 5)
        mock_mark_done.return_value = {"id": 10, "status": "approved", "order_id": 999}

        req = QuoteConvertRequest(
            mode="cash",
            payment_method="Efectivo",
            shipping_status="delivered",
            auto_invoice=False
        )

        user = {"full_name": "Test Operator", "username": "operator1"}
        result = convert_quote_to_sale_order(10, req, current_user=user)

        self.assertTrue(result["success"])
        self.assertIn("registrado como nueva venta", result["message"])
        mock_create_order.assert_called_once()
        mock_mark_done.assert_called_once()
        mock_deduct.assert_called_once_with("PROD-1", 1)

    @patch("src.database.get_quote_by_id")
    @patch("src.database.get_order_by_id")
    @patch("src.database.get_connection")
    @patch("src.database.mark_quote_completed")
    @patch("src.database.get_product_by_id")
    @patch("src.database.deduct_product_stock_by_ml_id")
    def test_convert_quote_link_transfer_updates_existing_order(
        self, mock_deduct, mock_get_prod, mock_mark_done, mock_get_conn, mock_get_order, mock_get_quote
    ):
        mock_get_quote.return_value = {
            "id": 10,
            "quote_number": "PRES-2026-0002",
            "customer_name": "Dario",
            "customer_doc": "3382672660",
            "status": "pending",
            "total_amount": 98400.0,
            "items": [
                {"id": "PROD-1", "title": "Batería 12V", "quantity": 1, "price": 98400.0}
            ]
        }
        mock_get_order.return_value = {
            "order_id": 179737320580,
            "buyer_name": "Dario Transfer",
            "total_amount": 98400.0,
            "source_platform": "MERCADOPAGO_TRANSFER",
            "shipping_status": "delivered"
        }

        # Mock DB cursor for the already_linked check and UPDATE
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # Not already linked to another quote
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        mock_get_prod.return_value = {"cost_price": 50000.0, "status": "active", "sync_meli": 0}
        mock_deduct.return_value = (True, 5)
        mock_mark_done.return_value = {"id": 10, "status": "approved", "order_id": 179737320580}

        req = QuoteConvertRequest(
            mode="link_transfer",
            existing_order_id=179737320580,
            shipping_status="delivered",
            auto_invoice=False
        )

        user = {"full_name": "Test Operator", "username": "operator1"}
        result = convert_quote_to_sale_order(10, req, current_user=user)

        self.assertTrue(result["success"])
        self.assertEqual(result["order_id"], 179737320580)
        self.assertIn("asociado exitosamente a la transferencia #179737320580", result["message"])
        mock_mark_done.assert_called_once_with(10, order_id=179737320580, completed_at=unittest.mock.ANY)
        mock_deduct.assert_called_once_with("PROD-1", 1)

    @patch("src.database.get_quote_by_id")
    @patch("src.database.get_connection")
    def test_get_quote_candidate_transfers(self, mock_get_conn, mock_get_quote):
        from src.api.quotes import get_quote_candidate_transfers
        mock_get_quote.return_value = {
            "id": 10,
            "quote_number": "PRES-2026-0002",
            "customer_name": "Dario",
            "total_amount": 98400.0
        }
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            {
                "order_id": 179737320580,
                "date_created": "2026-10-02T15:00:00",
                "buyer_name": "Dario MP",
                "total_amount": 98400.0,
                "source_platform": "MERCADOPAGO_TRANSFER",
                "payment_method": "Transferencia MP",
                "items_json": '[{"title": "Transferencia Recibida", "quantity": 1, "price": 98400.0}]',
                "inventory_linked": 0
            }
        ]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        res = get_quote_candidate_transfers(10)
        self.assertEqual(res["quote_id"], 10)
        self.assertEqual(len(res["candidates"]), 1)
        cand = res["candidates"][0]
        self.assertEqual(cand["order_id"], 179737320580)
        self.assertTrue(cand["is_exact_match"])
        self.assertTrue(cand["name_match"])

    @patch("src.database.get_order_by_id")
    @patch("src.database.get_connection")
    def test_lookup_transfer_for_quote(self, mock_get_conn, mock_get_order):
        from src.api.quotes import lookup_transfer_for_quote
        mock_get_order.return_value = {
            "order_id": 123456,
            "buyer": {"name": "Test Dario"},
            "total_amount": 98400.0
        }
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # Not linked
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        res = lookup_transfer_for_quote(123456)
        self.assertTrue(res["found"])
        self.assertFalse(res["already_linked"])
        self.assertEqual(res["order"]["order_id"], 123456)

    @patch("src.database.get_quote_by_id")
    @patch("src.database.get_next_quote_number")
    @patch("src.database.create_quote")
    @patch("src.api.quotes.generate_quote_pdf")
    def test_clone_single_quote(self, mock_pdf, mock_create, mock_next_num, mock_get_quote):
        from src.api.quotes import clone_single_quote
        mock_get_quote.return_value = {
            "id": 10,
            "quote_number": "PRES-2026-0010",
            "customer_name": "Cliente Clonable",
            "customer_phone": "341555555",
            "price_source": "web",
            "total_amount": 125000.0,
            "valid_days": 10,
            "notes": "Nota previa",
            "items": [{"title": "Panel Solar 450W", "quantity": 2, "price": 62500.0}]
        }
        mock_next_num.return_value = "PRES-2026-0011"
        mock_create.return_value = {
            "id": 11,
            "quote_number": "PRES-2026-0011",
            "customer_name": "Cliente Clonable",
            "total_amount": 125000.0,
            "status": "pending"
        }

        user = {"full_name": "Vendedor", "username": "vendedor"}
        result = clone_single_quote(10, current_user=user)

        self.assertTrue(result["success"])
        self.assertEqual(result["quote"]["quote_number"], "PRES-2026-0011")
        mock_create.assert_called_once()
        self.assertEqual(mock_create.call_args[1]["quote_number"], "PRES-2026-0011")
        self.assertEqual(mock_create.call_args[1]["customer_name"], "Cliente Clonable")
        mock_pdf.assert_called_once()


if __name__ == "__main__":
    unittest.main()

