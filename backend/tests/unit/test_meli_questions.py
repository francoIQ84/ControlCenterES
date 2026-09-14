import unittest
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from src.utils.meli_questions_service import sanitize_and_validate_answer, generate_ai_answer
from src import database


class TestMeliQuestions(unittest.TestCase):

    def test_sanitize_and_validate_clean_answer(self):
        answer = "¡Hola! Sí, tenemos stock en color negro disponible para envío inmediato. ¡Esperamos tu compra!"
        clean, is_valid, err = sanitize_and_validate_answer(answer)
        self.assertTrue(is_valid)
        self.assertEqual(err, "")
        self.assertEqual(clean, answer)

    def test_sanitize_rejects_phone_number(self):
        answer = "¡Hola! Para más detalles escribinos al WhatsApp +54 9 11 3456-7890 o llamanos."
        clean, is_valid, err = sanitize_and_validate_answer(answer)
        self.assertFalse(is_valid)
        self.assertIn("número telefónico", err.lower())

    def test_sanitize_rejects_email(self):
        answer = "Cualquier duda escribinos a contacto@mitienda.com.ar"
        clean, is_valid, err = sanitize_and_validate_answer(answer)
        self.assertFalse(is_valid)
        self.assertIn("email", err.lower())

    def test_sanitize_rejects_url(self):
        answer = "Mirá nuestro catálogo en https://www.mitienda.com/productos"
        clean, is_valid, err = sanitize_and_validate_answer(answer)
        self.assertFalse(is_valid)
        self.assertIn("enlace", err.lower())

    def test_generate_ai_answer_offline_fallback(self):
        item_data = {
            "title": "Auriculares Bluetooth Pro",
            "price": 45000.0,
            "available_quantity": 8,
            "status": "active"
        }
        answer, model = generate_ai_answer(
            question_text="¿Tienen stock disponible?",
            item_data=item_data,
            buyer_nickname="JUAN_PEREZ"
        )
        self.assertIsNotNone(answer)
        self.assertTrue(len(answer) > 10)


if __name__ == '__main__':
    unittest.main()
