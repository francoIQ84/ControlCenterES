"""
Tests unitarios y de integración para la funcionalidad de Doble Factor de Autenticación (2FA).
"""

import unittest
from datetime import datetime, timedelta
from src import database
from src.api.auth import mask_email, build_2fa_email_html

class TwoFactorAuthTest(unittest.TestCase):
    def test_mask_email(self):
        self.assertEqual(mask_email("franco@gmail.com"), "f***o@gmail.com")
        self.assertEqual(mask_email("al@test.com"), "a***@test.com")
        self.assertEqual(mask_email(""), "***")
        self.assertEqual(mask_email("sin_arroba"), "***")

    def test_build_2fa_email_html(self):
        html = build_2fa_email_html("654321", "Franco")
        self.assertIn("654321", html)
        self.assertIn("Franco", html)
        self.assertIn("Código de Verificación", html)

    def test_two_factor_db_lifecycle(self):
        # 1. Create a temporary user with 2FA
        test_username = "test_2fa_unit_user"
        # Cleanup if exists
        existing = database.get_user_by_username(test_username)
        if existing:
            database.delete_user(existing['id'])

        user_id = database.create_user(
            username=test_username,
            password="testpassword123",
            full_name="Usuario de Prueba 2FA",
            email="test_2fa@example.com",
            two_factor_enabled=True
        )

        try:
            # 2. Verify user info
            user = database.get_user_by_username(test_username)
            self.assertIsNotNone(user)
            self.assertEqual(user['email'], "test_2fa@example.com")
            self.assertTrue(user['two_factor_enabled'])

            # 3. Create 2FA code
            temp_token = "test_token_xyz_123"
            code = "123456"
            database.create_2fa_code(user_id, code, temp_token, expires_minutes=10)

            # 4. Get record
            rec = database.get_2fa_record(temp_token)
            self.assertIsNotNone(rec)
            self.assertEqual(rec['code'], "123456")
            self.assertEqual(rec['username'], test_username)
            self.assertEqual(rec['email'], "test_2fa@example.com")
            self.assertEqual(rec['attempts'], 0)

            # 5. Increment attempts
            attempts = database.increment_2fa_attempts(temp_token)
            self.assertEqual(attempts, 1)

            # 6. Update code (resend)
            database.update_2fa_code(temp_token, "987654", expires_minutes=10)
            rec2 = database.get_2fa_record(temp_token)
            self.assertEqual(rec2['code'], "987654")
            self.assertEqual(rec2['attempts'], 0)

            # 7. Update user info (toggle 2FA off)
            database.update_user_info(user_id, two_factor_enabled=False)
            user_updated = database.get_user_by_username(test_username)
            self.assertFalse(user_updated['two_factor_enabled'])

            # 8. Delete 2FA code
            database.delete_2fa_code(temp_token)
            self.assertIsNone(database.get_2fa_record(temp_token))

        finally:
            # Cleanup user
            database.delete_user(user_id)

    def test_two_factor_api_flow(self):
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)

        test_username = "test_api_2fa_user"
        existing = database.get_user_by_username(test_username)
        if existing:
            database.delete_user(existing['id'])

        user_id = database.create_user(
            username=test_username,
            password="securepassword123",
            full_name="Usuario API 2FA",
            email="franco@example.com",
            two_factor_enabled=True
        )

        try:
            with patch("src.utils.email_sender.send_smtp_email", return_value=(True, "Email enviado con éxito")):
                # 1. Test Login requiring 2FA
                login_res = client.post("/api/auth/login", json={
                    "username": test_username,
                    "password": "securepassword123"
                })
                self.assertEqual(login_res.status_code, 200)
                data = login_res.json()
                self.assertTrue(data.get("requires_2fa"))
                temp_token = data.get("temp_token")
                self.assertTrue(temp_token)
                self.assertEqual(data.get("masked_email"), "f***o@example.com")

                # Retrieve the generated code from database for verification test
                rec = database.get_2fa_record(temp_token)
                self.assertIsNotNone(rec)
                correct_code = rec['code']

                # 2. Test Invalid Code
                verify_bad = client.post("/api/auth/verify-2fa", json={
                    "temp_token": temp_token,
                    "code": "000000" if correct_code != "000000" else "111111"
                })
                self.assertEqual(verify_bad.status_code, 400)
                self.assertIn("Código incorrecto", verify_bad.json()["detail"])

                # 3. Test Resend Code
                # Force created_at to 40 seconds ago to pass cooldown
                database.get_connection()
                with database.get_connection() as conn:
                    with conn.cursor() as cursor:
                        cursor.execute("UPDATE two_factor_codes SET created_at = %s WHERE temp_token = %s", 
                                       (datetime.now() - timedelta(seconds=40), temp_token))

                resend_res = client.post("/api/auth/resend-2fa", json={"temp_token": temp_token})
                self.assertEqual(resend_res.status_code, 200)
                rec_after_resend = database.get_2fa_record(temp_token)
                new_code = rec_after_resend['code']

                # 4. Test Valid Code
                verify_ok = client.post("/api/auth/verify-2fa", json={
                    "temp_token": temp_token,
                    "code": new_code
                })
                self.assertEqual(verify_ok.status_code, 200)
                token_data = verify_ok.json()
                self.assertTrue(token_data.get("success"))
                self.assertTrue(token_data.get("token"))
                self.assertEqual(token_data.get("username"), test_username)

                # 5. Verify 2FA record was cleaned up
                self.assertIsNone(database.get_2fa_record(temp_token))

        finally:
            database.delete_user(user_id)

if __name__ == '__main__':
    unittest.main()
