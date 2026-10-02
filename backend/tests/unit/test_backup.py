import os
import sys
import types
import unittest
from unittest.mock import patch, MagicMock

# Stub google modules si no están en el entorno local
if "google" not in sys.modules:
    google_mod = types.ModuleType("google")
    auth_mod = types.ModuleType("google.auth")
    auth_trans_mod = types.ModuleType("google.auth.transport")
    auth_req_mod = types.ModuleType("google.auth.transport.requests")
    oauth2_mod = types.ModuleType("google.oauth2")
    oauth2_mod.service_account = MagicMock()
    oauth2_mod.credentials = MagicMock()
    api_client_mod = types.ModuleType("googleapiclient")
    disc_mod = types.ModuleType("googleapiclient.discovery")
    disc_mod.build = MagicMock()
    http_mod = types.ModuleType("googleapiclient.http")
    http_mod.MediaFileUpload = MagicMock()
    sys.modules["google"] = google_mod
    sys.modules["google.auth"] = auth_mod
    sys.modules["google.auth.transport"] = auth_trans_mod
    sys.modules["google.auth.transport.requests"] = auth_req_mod
    sys.modules["google.oauth2"] = oauth2_mod
    sys.modules["google.oauth2.service_account"] = oauth2_mod.service_account
    sys.modules["google.oauth2.credentials"] = oauth2_mod.credentials
    sys.modules["googleapiclient"] = api_client_mod
    sys.modules["googleapiclient.discovery"] = disc_mod
    sys.modules["googleapiclient.http"] = http_mod

from src.api import backup

class BackupUnitTest(unittest.TestCase):
    @patch("src.api.backup.platform.release", return_value="10.0.19045")
    @patch("src.api.backup.platform.system", return_value="Windows")
    @patch("src.api.backup.subprocess.run")
    @patch("src.api.backup._export_platform_config")
    @patch("src.api.backup.get_db_url")
    def test_run_backup_dump_no_unbound_local_error(self, mock_db_url, mock_export_platform, mock_subprocess, mock_sys, mock_rel):
        mock_db_url.return_value = "postgresql://test:test@localhost:5432/testdb"
        mock_export_platform.return_value = {"meli_app_id": "12345"}
        
        # Simular pg_dump creando un archivo sql vacío
        def fake_subprocess_run(cmd, *args, **kwargs):
            if cmd[0] == "pg_dump":
                sql_path = cmd[3]
                with open(sql_path, "w", encoding="utf-8") as f:
                    f.write("-- dummy dump")
                res = MagicMock()
                res.returncode = 0
                return res
            res = MagicMock()
            res.returncode = 0
            res.stdout = b"16"
            return res

        mock_subprocess.side_effect = fake_subprocess_run

        # Ejecutar dump
        filename = backup.run_backup_dump(is_auto=False)
        self.assertTrue(filename.startswith("backup_"))
        self.assertTrue(filename.endswith(".zip"))

        # Limpiar los archivos de backup generados por la prueba
        backup_path = os.path.join(backup.BACKUP_DIR, filename)
        if os.path.exists(backup_path):
            os.remove(backup_path)
        media_filename = filename.replace(".zip", "_media.zip")
        media_path = os.path.join(backup.BACKUP_DIR, media_filename)
        if os.path.exists(media_path):
            os.remove(media_path)

    @patch("src.utils.google_drive.upload_file", return_value="drive_file_123")
    @patch("src.api.backup._get_service_account_path", return_value="service_account.json")
    @patch("src.database.get_setting", return_value="fake_folder_123")
    @patch("os.path.isfile")
    @patch("builtins.open", new_callable=unittest.mock.mock_open, read_data='{"client_email": "test@service.com"}')
    def test_upload_backup_to_drive_success(self, mock_open, mock_isfile, mock_get_setting, mock_sa_path, mock_upload):
        mock_isfile.return_value = True
        with patch("os.path.commonpath", return_value=os.path.realpath(backup.BACKUP_DIR)):
            res = backup.upload_backup_to_drive("backup_20260101_120000")
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["main_file_id"], "drive_file_123")

    @patch("src.utils.google_drive.get_drive_service")
    @patch("src.database.get_setting")
    def test_get_google_drive_status_oauth(self, mock_get_setting, mock_drive_service):
        def fake_get_setting(key, default=""):
            settings = {
                "google_drive_folder_id": "test_folder",
                "google_oauth_client_id": "client_123",
                "google_oauth_client_secret": "secret_123",
                "google_oauth_refresh_token": "refresh_123",
                "google_oauth_user_email": "user@gmail.com",
            }
            return settings.get(key, default)

        mock_get_setting.side_effect = fake_get_setting
        mock_drive_service.return_value = (MagicMock(), "oauth")

        status = backup.get_google_drive_status()
        self.assertTrue(status["connected"])
        self.assertEqual(status["auth_mode"], "oauth")
        self.assertEqual(status["user_email"], "user@gmail.com")
        self.assertTrue(status["has_client_credentials"])
        self.assertTrue(status["is_oauth_configured"])

    @patch("src.utils.google_drive.get_auth_url", return_value="https://accounts.google.com/o/oauth2/auth?test=1")
    @patch("src.database.get_setting")
    def test_get_google_drive_auth_url(self, mock_get_setting, mock_auth_url):
        def fake_get_setting(key, default=""):
            if key == "google_oauth_client_id":
                return "test_client_id"
            if key == "google_oauth_client_secret":
                return "test_client_secret"
            return default

        mock_get_setting.side_effect = fake_get_setting
        res = backup.get_google_drive_auth_url()
        self.assertIn("auth_url", res)
        self.assertIn("accounts.google.com", res["auth_url"])

    @patch("src.utils.google_drive.exchange_code_for_tokens")
    @patch("src.utils.google_drive.get_drive_service")
    @patch("src.utils.google_drive.get_user_profile")
    @patch("src.database.set_setting")
    @patch("src.database.get_setting")
    def test_google_drive_oauth_callback_success(self, mock_get_setting, mock_set_setting, mock_profile, mock_drive_svc, mock_exchange):
        mock_exchange.return_value = {
            "access_token": "acc_123",
            "refresh_token": "ref_123",
        }
        mock_drive_svc.return_value = (MagicMock(), "oauth")
        mock_profile.return_value = {"success": True, "email": "test@gmail.com"}

        resp = backup.google_drive_oauth_callback(code="valid_code")
        self.assertEqual(resp.status_code, 307)
        self.assertIn("gdrive_connected=true", resp.headers["location"])

    @patch("src.database.get_connection")
    def test_run_tenant_backup_success(self, mock_get_conn):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_get_conn.return_value.__enter__.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur

        # Return mock row for customers
        def fake_fetchall():
            return [{"id": 1, "name": "Cliente Test", "tenant_id": "test_t_id"}]

        mock_cur.fetchall.side_effect = fake_fetchall

        fake_tenant_id = "00000000-0000-0000-0000-000000000002"
        res = backup.run_tenant_backup(fake_tenant_id, "negocio_demo", "Negocio Demo")
        self.assertEqual(res["status"], "success")
        self.assertTrue(res["filename"].startswith("backup_tenant_negocio_demo_"))
        self.assertTrue(res["filename"].endswith(".zip"))

        # Verify ZIP contains expected files
        tenant_dir = os.path.join(backup.TENANT_BACKUP_DIR, fake_tenant_id)
        zip_path = os.path.join(tenant_dir, res["filename"])
        self.assertTrue(os.path.isfile(zip_path))

        import zipfile
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            self.assertIn("tenant_data.json", names)
            self.assertIn("tenant_data.sql", names)
            self.assertIn("backup_manifest.json", names)

        # Cleanup
        if os.path.exists(zip_path):
            os.remove(zip_path)
        if os.path.exists(tenant_dir):
            try:
                os.rmdir(tenant_dir)
            except Exception:
                pass



