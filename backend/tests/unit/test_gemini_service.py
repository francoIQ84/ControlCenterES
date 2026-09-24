import unittest
from unittest.mock import patch, MagicMock
from src.utils.gemini_service import (
    get_available_gemini_models,
    extract_gemini_error,
    FALLBACK_GEMINI_MODELS,
    _get_model_priority
)
from src.utils.video_generator import (
    build_fallback_video_script,
    generate_video_script_with_gemini
)


class GeminiServiceTestCase(unittest.TestCase):
    def test_fallback_models_exist(self):
        """Verifica que la lista de modelos de respaldo contenga modelos modernos y válidos."""
        self.assertIn("gemini-3.8-flash", FALLBACK_GEMINI_MODELS)
        self.assertIn("gemini-2.5-flash", FALLBACK_GEMINI_MODELS)
        self.assertNotIn("gemini-3.6-flash", FALLBACK_GEMINI_MODELS)
        self.assertNotIn("gemini-2.0-flash", FALLBACK_GEMINI_MODELS)

    def test_empty_key_returns_fallbacks(self):
        """Si la key está vacía, devuelve los modelos de respaldo."""
        models = get_available_gemini_models("")
        self.assertEqual(models, FALLBACK_GEMINI_MODELS)

    def test_model_priority_order(self):
        """Los modelos Flash más recientes deben tener mayor prioridad (menor score)."""
        score_38 = _get_model_priority("gemini-3.8-flash")
        score_25 = _get_model_priority("gemini-2.5-flash")
        score_pro = _get_model_priority("gemini-2.5-pro")

        self.assertLess(score_38, score_25)
        self.assertLess(score_25, score_pro)

    def test_fallback_video_script_generation(self):
        """Verifica que build_fallback_video_script genere un guión válido de 4 escenas."""
        product_data = {
            "title": "Solución Nutritiva A+B",
            "price_selected": 25000,
            "category_name": "Nutrientes",
            "description": "Kit de nutrientes para hidroponia",
            "images": "https://example.com/img1.jpg,https://example.com/img2.jpg"
        }
        script = build_fallback_video_script(
            product_data=product_data,
            merchant_name="Hidroponia Rosario",
            brand_hashtag="#HidroponiaRosario"
        )

        self.assertIn("scenes", script)
        self.assertEqual(len(script["scenes"]), 4)
        self.assertIn("full_caption", script)
        self.assertIn("#HidroponiaRosario", script["full_caption"])
        self.assertEqual(script["product_price"], 25000)

    @patch("src.database.get_platform_setting", return_value="")
    def test_generate_video_script_without_key_uses_fallback(self, mock_get_setting):
        """Si no hay API Key configurada, no debe lanzar error 500, sino devolver el guión fallback estructurado."""
        product_data = {
            "title": "Bomba Sumergible 1000L",
            "price": 18500
        }
        res = generate_video_script_with_gemini(product_data)
        self.assertIn("scenes", res)
        self.assertEqual(len(res["scenes"]), 4)


if __name__ == "__main__":
    unittest.main()
