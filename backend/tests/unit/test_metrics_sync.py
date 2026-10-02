"""
Tests unitarios de la sincronización periódica y multi-tenant de métricas de Facebook e Instagram.
"""

import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
import json

from src.utils import social_publisher


class MetricsSyncDueCheckTest(unittest.TestCase):
    def test_sin_credenciales_no_hace_nada(self):
        with patch.object(social_publisher, "get_meta_credentials", return_value={"access_token": "", "facebook_page_id": "", "instagram_account_id": ""}):
            res = social_publisher.check_and_sync_social_metrics_if_due({"slug": "test_tenant"})
        self.assertFalse(res["synced"])
        self.assertEqual(res["reason"], "no_credentials")

    def test_omite_si_ya_sincronizo_recientemente_mismo_dia(self):
        recent_time = (datetime.now() - timedelta(hours=2)).isoformat()
        with patch.object(social_publisher, "get_meta_credentials", return_value={"access_token": "token123", "facebook_page_id": "page123", "instagram_account_id": "ig123"}), \
             patch("src.database.get_setting", side_effect=lambda k, default="": recent_time if k == "meta_metrics_last_synced_at" else default), \
             patch.object(social_publisher, "sync_social_posts_metrics") as mock_sync:
            res = social_publisher.check_and_sync_social_metrics_if_due({"slug": "test_tenant"})
        self.assertFalse(res["synced"])
        self.assertEqual(res["reason"], "already_synced_recently")
        mock_sync.assert_not_called()

    def test_ejecuta_si_cambio_el_dia_calendario(self):
        yesterday_time = (datetime.now() - timedelta(days=1, hours=1)).isoformat()
        with patch.object(social_publisher, "get_meta_credentials", return_value={"access_token": "token123", "facebook_page_id": "page123", "instagram_account_id": "ig123"}), \
             patch("src.database.get_setting", side_effect=lambda k, default="": yesterday_time if k == "meta_metrics_last_synced_at" else default), \
             patch.object(social_publisher, "sync_social_posts_metrics", return_value={"success": True, "updated_count": 3, "last_synced_at": datetime.now().isoformat()}):
            res = social_publisher.check_and_sync_social_metrics_if_due({"slug": "test_tenant"})
        self.assertTrue(res["synced"])
        self.assertEqual(res["updated_count"], 3)

    def test_ejecuta_si_transcurrio_el_intervalo_en_horas(self):
        twelve_hours_ago = (datetime.now() - timedelta(hours=14)).isoformat()
        with patch.object(social_publisher, "get_meta_credentials", return_value={"access_token": "token123", "facebook_page_id": "page123", "instagram_account_id": "ig123"}), \
             patch("src.database.get_setting", side_effect=lambda k, default="": twelve_hours_ago if k == "meta_metrics_last_synced_at" else default), \
             patch.object(social_publisher, "sync_social_posts_metrics", return_value={"success": True, "updated_count": 5, "last_synced_at": datetime.now().isoformat()}):
            res = social_publisher.check_and_sync_social_metrics_if_due({"slug": "test_tenant"})
        self.assertTrue(res["synced"])
        self.assertEqual(res["updated_count"], 5)


class MetricsExtractionAndMatchingTest(unittest.TestCase):
    def test_matching_y_actualizacion_de_metricas(self):
        db_post = {
            "id": 42,
            "title": "Panel Solar 10W USB",
            "caption": "¡No te quedes sin batería nunca más! Panel solar portátil para cultivo y camping.",
            "external_post_id": '{"facebook_id": "fb_post_100", "instagram_id": "ig_media_200"}',
            "metrics": {}
        }

        fb_posts_api = [{
            "id": "fb_post_100",
            "message": db_post["caption"],
            "created_time": "2026-09-27T10:00:00+0000",
            "reactions": {"summary": {"total_count": 7}},
            "comments": {"summary": {"total_count": 2}},
            "shares": {"count": 1}
        }]

        ig_media_api = [{
            "id": "ig_media_200",
            "caption": db_post["caption"],
            "media_type": "IMAGE",
            "like_count": 15,
            "comments_count": 4,
            "permalink": "https://www.instagram.com/p/TEST12345/"
        }]

        def mock_urlopen(req, timeout=None):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            resp = MagicMock()
            resp.__enter__.return_value = resp
            if "/posts?" in url:
                resp.read.return_value = json.dumps({"data": fb_posts_api}).encode('utf-8')
            elif "/insights?" in url:
                # FB post insights
                resp.read.return_value = json.dumps({
                    "data": [
                        {"name": "post_media_view", "values": [{"value": 85}]},
                        {"name": "post_total_media_view_unique", "values": [{"value": 60}]},
                        {"name": "post_clicks", "values": [{"value": 12}]},
                        {"name": "post_reactions_by_type_total", "values": [{"value": {"like": 7}}]}
                    ]
                }).encode('utf-8')
            elif "/media?" in url:
                resp.read.return_value = json.dumps({"data": ig_media_api}).encode('utf-8')
            else:
                resp.read.return_value = b'{"data": []}'
            return resp

        updated_posts = {}
        def mock_update_metrics(post_id, metrics):
            updated_posts[post_id] = metrics

        with patch.object(social_publisher, "get_meta_credentials", return_value={"access_token": "token123", "facebook_page_id": "page123", "instagram_account_id": "ig123"}), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen), \
             patch("src.database.get_marketing_posts", return_value=[db_post]), \
             patch("src.database.update_marketing_post_metrics", side_effect=mock_update_metrics), \
             patch("src.database.set_setting") as mock_set_setting:

            res = social_publisher.sync_social_posts_metrics()

        self.assertTrue(res["success"])
        self.assertEqual(res["updated_count"], 1)
        self.assertIn(42, updated_posts)

        metrics = updated_posts[42]
        # Validar métricas de Facebook
        self.assertIn("facebook", metrics)
        fb_m = metrics["facebook"]
        self.assertEqual(fb_m["id"], "fb_post_100")
        self.assertEqual(fb_m["views"], 85)
        self.assertEqual(fb_m["reach"], 60)
        self.assertEqual(fb_m["reactions"], 7)
        self.assertEqual(fb_m["likes"], 7)
        self.assertEqual(fb_m["comments"], 2)
        self.assertEqual(fb_m["shares"], 1)

        # Validar métricas de Instagram
        self.assertIn("instagram", metrics)
        ig_m = metrics["instagram"]
        self.assertEqual(ig_m["id"], "ig_media_200")
        self.assertEqual(ig_m["likes"], 15)
        self.assertEqual(ig_m["comments"], 4)
        self.assertEqual(ig_m["permalink"], "https://www.instagram.com/p/TEST12345/")

        mock_set_setting.assert_called_with("meta_metrics_last_synced_at", unittest.mock.ANY)


if __name__ == "__main__":
    unittest.main()
