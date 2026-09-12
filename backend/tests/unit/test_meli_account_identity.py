"""Identidad de la cuenta de Mercado Libre vinculada (nickname + email).

Las cuentas vinculadas antes de que se guardara meli_email quedaron con
nickname pero sin email. Estos tests fijan cuando se le vuelve a preguntar a
Mercado Libre y cuando no: /status se consulta en cada navegacion del panel,
asi que no puede pegarle a /users/me cada vez.
"""
import sys
import types
import unittest
from unittest.mock import patch

# El entorno de desarrollo no tiene salida a internet para instalar
# dependencias, asi que se stubea lo unico que falta en la cadena de imports
# (python-dotenv). Los tests no leen ningun .env: el estado se inyecta con patch.
try:  # pragma: no cover - depende del entorno
    import dotenv  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    _dotenv_stub = types.ModuleType('dotenv')
    _dotenv_stub.load_dotenv = lambda *args, **kwargs: False
    sys.modules['dotenv'] = _dotenv_stub

from src import meli_api


class FakeSettingsStore:
    """Reemplaza database.get_setting / set_setting con un dict en memoria."""

    def __init__(self, initial=None):
        self.values = dict(initial or {})

    def get_setting(self, key, default=None):
        return self.values.get(key, default)

    def set_setting(self, key, value):
        self.values[key] = value


class ResolveAccountIdentityTest(unittest.TestCase):
    def _resolve(self, stored, user_info):
        store = FakeSettingsStore(stored)
        with patch.object(meli_api.database, 'get_setting', store.get_setting), \
             patch.object(meli_api.database, 'set_setting', store.set_setting), \
             patch.object(meli_api, 'fetch_user_info', return_value=user_info) as fetch:
            nickname, email = meli_api.resolve_account_identity()
        return nickname, email, store, fetch

    def test_completa_el_email_cuando_falta_pero_ya_hay_nickname(self):
        nickname, email, store, fetch = self._resolve(
            stored={'meli_nickname': 'HIDROPONIAROSARIO'},
            user_info={'nickname': 'HIDROPONIAROSARIO', 'email': 'ventas@hidroponiarosario.com'},
        )
        fetch.assert_called_once()
        self.assertEqual(email, 'ventas@hidroponiarosario.com')
        self.assertEqual(store.values['meli_email'], 'ventas@hidroponiarosario.com')
        self.assertEqual(nickname, 'HIDROPONIAROSARIO')

    def test_no_vuelve_a_consultar_si_ya_estan_los_dos_datos(self):
        _nickname, email, _store, fetch = self._resolve(
            stored={'meli_nickname': 'HIDROPONIAROSARIO', 'meli_email': 'ventas@hidroponiarosario.com'},
            user_info={'nickname': 'OTRO', 'email': 'otro@mail.com'},
        )
        fetch.assert_not_called()
        self.assertEqual(email, 'ventas@hidroponiarosario.com')

    def test_no_insiste_si_mercado_libre_no_informa_email(self):
        _nickname, _email, store, fetch = self._resolve(
            stored={'meli_nickname': 'HIDROPONIAROSARIO'},
            user_info={'nickname': 'HIDROPONIAROSARIO', 'email': ''},
        )
        fetch.assert_called_once()
        self.assertEqual(store.values['meli_email_checked'], '1')

        _n2, _e2, _s2, fetch2 = self._resolve(
            stored=store.values,
            user_info={'nickname': 'HIDROPONIAROSARIO', 'email': ''},
        )
        fetch2.assert_not_called()

    def test_conserva_lo_guardado_si_la_consulta_falla(self):
        nickname, email, store, fetch = self._resolve(
            stored={'meli_nickname': 'HIDROPONIAROSARIO'},
            user_info=None,
        )
        fetch.assert_called_once()
        self.assertEqual(nickname, 'HIDROPONIAROSARIO')
        self.assertEqual(email, '')
        # Sin respuesta no se marca como consultado: se reintenta la proxima vez
        self.assertNotIn('meli_email_checked', store.values)


if __name__ == '__main__':
    unittest.main()
