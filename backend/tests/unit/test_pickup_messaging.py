import unittest
from unittest.mock import patch, MagicMock
from src import database, meli_api
from src.api.sales import send_manual_message, MessageManualRequest

class TestPickupMessaging(unittest.TestCase):

    def test_settings_pickup_message(self):
        # Default pickup message should exist
        msg = database.get_setting('meli_msg_pickup', '¡Hola! Te informamos que tu paquete ya está disponible y a la espera de ser retirado en el punto de retiro / sucursal seleccionada. Recuerda llevar tu DNI y el código de seguimiento. ¡Muchas gracias por tu compra!')
        self.assertTrue('punto de retiro' in msg)
        self.assertTrue(len(msg) > 10)

    @patch('src.database.get_setting')
    @patch('src.meli_api.send_post_sale_message')
    def test_send_manual_pickup_message(self, mock_send, mock_setting):
        mock_setting.return_value = '¡Hola! Tu paquete está a la espera de ser retirado en el punto de retiro.'
        mock_send.return_value = (True, "Mensaje enviado")
        req = MessageManualRequest(message_type='pickup')
        
        with patch('src.database.get_connection'):
            res = send_manual_message('2000123456', req)
            self.assertTrue(res['success'])
            mock_send.assert_called_once()
            called_order_id, called_text = mock_send.call_args[0]
            self.assertEqual(called_order_id, '2000123456')
            self.assertIn('punto de retiro', called_text)

if __name__ == '__main__':
    unittest.main()
