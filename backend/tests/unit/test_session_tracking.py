"""
Tests unitarios para el seguimiento automático de accesos diarios de sesión (Opción 1).
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from src import database
from src.api import auth

def setUpModule():
    database.init_db()

class SessionTrackingTest(unittest.TestCase):
    def setUp(self):
        # Limpiar caché de actividad en memoria antes de cada test
        auth._session_activity_cache.clear()

        self.test_username = "test_tracking_user"
        # Limpiar usuario si ya existía
        existing = database.get_user_by_username(self.test_username)
        if existing:
            database.delete_user(existing['id'])

        self.user_id = database.create_user(
            username=self.test_username,
            password="testpassword123",
            full_name="Usuario Tracking Prueba",
            email="tracking@example.com"
        )
        self.test_token = "test_tracking_token_1234567890abcdef"
        expires_at = datetime.now() + timedelta(days=7)
        database.create_session(self.test_token, self.user_id, expires_at, ip="190.1.1.1")

    def tearDown(self):
        database.delete_session(self.test_token)
        database.delete_user(self.user_id)
        auth._session_activity_cache.clear()

    def test_session_activity_info_and_update(self):
        info = database.get_session_activity_info(self.test_token)
        self.assertIsNotNone(info)
        self.assertEqual(info['username'], self.test_username)
        self.assertEqual(info['last_ip'], "190.1.1.1")
        self.assertIsNotNone(info['last_history_logged_at'])

        # Actualizar IP y fecha
        new_time = datetime.now() - timedelta(hours=10)
        database.update_session_activity(self.test_token, "190.2.2.2", logged_at=new_time)
        info2 = database.get_session_activity_info(self.test_token)
        self.assertEqual(info2['last_ip'], "190.2.2.2")
        self.assertAlmostEqual(info2['last_history_logged_at'].timestamp(), new_time.timestamp(), delta=2)

    def test_check_and_record_session_access_triggers_on_time_or_ip(self):
        # Simular request con IP 190.1.1.1
        request = MagicMock()
        request.headers = {"User-Agent": "TestBrowser/1.0"}
        request.client.host = "190.1.1.1"

        # 1. Poner last_history_logged_at hace 10 horas
        past_time = datetime.now() - timedelta(hours=10)
        database.update_session_activity(self.test_token, "190.1.1.1", logged_at=past_time)

        # Llamar a check_and_record_session_access
        auth.check_and_record_session_access(self.test_token, request)

        # Debe haber registrado un acceso exitoso (sesión activa)
        history = database.get_login_history(limit=5)
        latest = next((h for h in history if h['username'] == self.test_username), None)
        self.assertIsNotNone(latest)
        self.assertEqual(latest['status'], "success (sesión activa)")
        self.assertEqual(latest['ip_address'], "190.1.1.1")

        # 2. Llamada inmediata subsiguiente (no debe registrar otro porque pasaron 0 horas y misma IP)
        initial_history_len = len([h for h in database.get_login_history(limit=20) if h['username'] == self.test_username])
        auth.check_and_record_session_access(self.test_token, request)
        after_len = len([h for h in database.get_login_history(limit=20) if h['username'] == self.test_username])
        self.assertEqual(initial_history_len, after_len)

        # 3. Cambio de IP: debe registrar inmediatamente
        request_new_ip = MagicMock()
        request_new_ip.headers = {"User-Agent": "TestBrowser/1.0"}
        request_new_ip.client.host = "190.99.99.99"

        auth.check_and_record_session_access(self.test_token, request_new_ip)
        after_ip_change_len = len([h for h in database.get_login_history(limit=20) if h['username'] == self.test_username])
        self.assertEqual(after_ip_change_len, initial_history_len + 1)

if __name__ == '__main__':
    unittest.main()
