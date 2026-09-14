"""
Tests unitarios de src/utils/crypto.py.

El cifrado de credenciales es la última línea de defensa si alguien consigue un
volcado de la base, así que las propiedades que importan se prueban de forma
explícita: que el secreto no quede legible, que un blob de otro tenant no
descifre, y que cualquier alteración se detecte en vez de pasar inadvertida.
"""

import base64
import os
import unittest

from src.utils import crypto


class KeyManagementTest(unittest.TestCase):
    def setUp(self):
        self._saved = os.environ.get(crypto.ENV_KEY_NAME)

    def tearDown(self):
        if self._saved is None:
            os.environ.pop(crypto.ENV_KEY_NAME, None)
        else:
            os.environ[crypto.ENV_KEY_NAME] = self._saved

    def test_la_clave_generada_es_de_256_bits(self):
        key = crypto.generate_key()
        self.assertEqual(len(base64.urlsafe_b64decode(key)), 32)

    def test_cada_clave_generada_es_distinta(self):
        self.assertNotEqual(crypto.generate_key(), crypto.generate_key())

    def test_sin_clave_falla_con_un_mensaje_util(self):
        os.environ.pop(crypto.ENV_KEY_NAME, None)
        self.assertFalse(crypto.is_configured())
        with self.assertRaises(crypto.EncryptionKeyMissing) as ctx:
            crypto.encrypt("x")
        self.assertIn(crypto.ENV_KEY_NAME, str(ctx.exception))

    def test_rechaza_una_clave_de_largo_incorrecto(self):
        os.environ[crypto.ENV_KEY_NAME] = base64.urlsafe_b64encode(b"corta").decode()
        self.assertFalse(crypto.is_configured())
        with self.assertRaises(crypto.EncryptionKeyMissing):
            crypto.encrypt("x")

    def test_rechaza_una_clave_que_no_es_base64(self):
        os.environ[crypto.ENV_KEY_NAME] = "esto no es base64 !!!"
        self.assertFalse(crypto.is_configured())

    def test_is_configured_con_clave_valida(self):
        os.environ[crypto.ENV_KEY_NAME] = crypto.generate_key()
        self.assertTrue(crypto.is_configured())


class EncryptDecryptTest(unittest.TestCase):
    TENANT_A = "11111111-1111-1111-1111-111111111111"
    TENANT_B = "22222222-2222-2222-2222-222222222222"

    def setUp(self):
        self._saved = os.environ.get(crypto.ENV_KEY_NAME)
        os.environ[crypto.ENV_KEY_NAME] = crypto.generate_key()

    def tearDown(self):
        if self._saved is None:
            os.environ.pop(crypto.ENV_KEY_NAME, None)
        else:
            os.environ[crypto.ENV_KEY_NAME] = self._saved

    def test_round_trip(self):
        token = crypto.encrypt("APP_USR-secreto", self.TENANT_A)
        self.assertEqual(crypto.decrypt(token, self.TENANT_A), "APP_USR-secreto")

    def test_el_ciphertext_no_revela_el_secreto(self):
        token = crypto.encrypt("APP_USR-secreto", self.TENANT_A)
        self.assertNotIn("APP_USR-secreto", token)
        self.assertNotIn("APP_USR", token)

    def test_lleva_prefijo_de_version(self):
        """El prefijo permite rotar el algoritmo sin tener que adivinar cómo se
        cifró cada fila vieja."""
        self.assertTrue(crypto.encrypt("x", self.TENANT_A).startswith("v1:"))

    def test_dos_cifrados_del_mismo_texto_difieren(self):
        """Nonce aleatorio: si dos filas iguales dieran el mismo ciphertext, se
        podría inferir qué tenants comparten credencial."""
        a = crypto.encrypt("mismo-valor", self.TENANT_A)
        b = crypto.encrypt("mismo-valor", self.TENANT_A)
        self.assertNotEqual(a, b)
        self.assertEqual(crypto.decrypt(a, self.TENANT_A),
                         crypto.decrypt(b, self.TENANT_A))

    def test_un_blob_de_otro_tenant_no_descifra(self):
        """El tenant_id va como Additional Authenticated Data: copiar el blob a
        la fila de otro inquilino no sirve de nada."""
        token = crypto.encrypt("secreto-de-a", self.TENANT_A)
        with self.assertRaises(crypto.DecryptionFailed):
            crypto.decrypt(token, self.TENANT_B)

    def test_un_ciphertext_alterado_se_rechaza(self):
        token = crypto.encrypt("secreto", self.TENANT_A)
        payload = token[3:]
        blob = bytearray(base64.urlsafe_b64decode(payload))
        blob[-1] ^= 0xFF                       # un bit distinto en el tag
        tampered = "v1:" + base64.urlsafe_b64encode(bytes(blob)).decode()
        with self.assertRaises(crypto.DecryptionFailed):
            crypto.decrypt(tampered, self.TENANT_A)

    def test_otra_clave_maestra_no_descifra(self):
        token = crypto.encrypt("secreto", self.TENANT_A)
        os.environ[crypto.ENV_KEY_NAME] = crypto.generate_key()
        with self.assertRaises(crypto.DecryptionFailed):
            crypto.decrypt(token, self.TENANT_A)

    def test_formato_desconocido(self):
        for bad in ("", "sin-prefijo", "v9:abcd", "v1:"):
            with self.subTest(value=bad):
                with self.assertRaises(crypto.DecryptionFailed):
                    crypto.decrypt(bad, self.TENANT_A)

    def test_ciphertext_demasiado_corto(self):
        short = "v1:" + base64.urlsafe_b64encode(b"12345").decode()
        with self.assertRaises(crypto.DecryptionFailed):
            crypto.decrypt(short, self.TENANT_A)

    def test_texto_vacio_es_valido(self):
        self.assertEqual(crypto.decrypt(crypto.encrypt("", self.TENANT_A),
                                        self.TENANT_A), "")

    def test_unicode(self):
        original = "clave con ñ, acentos áéí y emoji 🌱"
        token = crypto.encrypt(original, self.TENANT_A)
        self.assertEqual(crypto.decrypt(token, self.TENANT_A), original)

    def test_no_cifra_none(self):
        with self.assertRaises(ValueError):
            crypto.encrypt(None, self.TENANT_A)


class JsonHelpersTest(unittest.TestCase):
    TENANT = "11111111-1111-1111-1111-111111111111"

    def setUp(self):
        self._saved = os.environ.get(crypto.ENV_KEY_NAME)
        os.environ[crypto.ENV_KEY_NAME] = crypto.generate_key()

    def tearDown(self):
        if self._saved is None:
            os.environ.pop(crypto.ENV_KEY_NAME, None)
        else:
            os.environ[crypto.ENV_KEY_NAME] = self._saved

    def test_round_trip_de_un_diccionario(self):
        creds = {"client_id": "111", "client_secret": "s3cr3t",
                 "access_token": "APP_USR-abc"}
        token = crypto.encrypt_json(creds, self.TENANT)
        self.assertEqual(crypto.decrypt_json(token, self.TENANT), creds)

    def test_ningun_valor_queda_legible(self):
        creds = {"client_secret": "VALOR-SENSIBLE"}
        self.assertNotIn("VALOR-SENSIBLE", crypto.encrypt_json(creds, self.TENANT))

    def test_diccionario_vacio(self):
        self.assertEqual(
            crypto.decrypt_json(crypto.encrypt_json({}, self.TENANT), self.TENANT),
            {})


class MaskTest(unittest.TestCase):
    def test_deja_ver_solo_el_final(self):
        masked = crypto.mask("APP_USR-1234567890abcdef")
        self.assertTrue(masked.endswith("cdef"))
        self.assertNotIn("APP_USR", masked)

    def test_valor_corto_se_oculta_entero(self):
        self.assertEqual(crypto.mask("abc"), "•••")

    def test_valores_vacios(self):
        self.assertEqual(crypto.mask(""), "")
        self.assertEqual(crypto.mask(None), "")


if __name__ == "__main__":
    unittest.main()
