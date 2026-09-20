"""
Tests de `database.get_platform_setting`.

Resuelve las credenciales que un negocio puede tener propias pero que también
existen a nivel plataforma (App de Mercado Libre, de Tiendanube, clave de
Gemini). Dos bugs distintos lo motivaron:

  * `settings` tiene RLS, así que desde el contexto de un inquilino no se ve
    la fila del Maestro: la clave cargada en el panel Superadmin era invisible
    para todos los negocios.
  * La variable de entorno se leía PRIMERO, así que definirla en el servidor
    pisaba en silencio lo que cada negocio hubiera configurado.
"""

import os
import sys
import types
import unittest
from unittest.mock import patch

try:  # pragma: no cover - depende del entorno
    import dotenv  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    _dotenv_stub = types.ModuleType('dotenv')
    _dotenv_stub.load_dotenv = lambda *args, **kwargs: False
    sys.modules['dotenv'] = _dotenv_stub

from src import database, tenancy

TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


class GetPlatformSettingTest(unittest.TestCase):
    """`get_setting` se mockea para devolver un valor distinto según el tenant
    activo, que es exactamente lo que hace RLS en la base real."""

    def _fake_get_setting(self, por_tenant):
        def fake(key, default=None):
            return por_tenant.get(tenancy.get_current_tenant_id(), default)
        return fake

    def test_gana_lo_propio_del_negocio(self):
        valores = {TENANT: "clave-del-negocio",
                   tenancy.MASTER_TENANT_ID: "clave-de-plataforma"}
        with patch.object(database, "get_setting", self._fake_get_setting(valores)):
            with patch.dict(os.environ, {"X_KEY": "clave-del-entorno"}):
                with tenancy.tenant_context(TENANT):
                    self.assertEqual(
                        database.get_platform_setting("k", "X_KEY"),
                        "clave-del-negocio")

    def test_cae_a_la_credencial_de_plataforma(self):
        """Es el caso que estaba roto: el panel Superadmin guarda en el
        Maestro y el inquilino no lo veía por RLS."""
        valores = {tenancy.MASTER_TENANT_ID: "clave-de-plataforma"}
        with patch.object(database, "get_setting", self._fake_get_setting(valores)):
            with tenancy.tenant_context(TENANT):
                self.assertEqual(
                    database.get_platform_setting("k", "X_KEY"),
                    "clave-de-plataforma")

    def test_el_entorno_va_ultimo(self):
        valores = {}
        with patch.object(database, "get_setting", self._fake_get_setting(valores)):
            with patch.dict(os.environ, {"X_KEY": "clave-del-entorno"}):
                with tenancy.tenant_context(TENANT):
                    self.assertEqual(
                        database.get_platform_setting("k", "X_KEY"),
                        "clave-del-entorno")

    def test_el_entorno_no_pisa_lo_configurado(self):
        """El bug original: con la variable definida en el servidor, el App ID
        que cargaba cada negocio se ignoraba sin ningún aviso."""
        valores = {TENANT: "clave-del-negocio"}
        with patch.object(database, "get_setting", self._fake_get_setting(valores)):
            with patch.dict(os.environ, {"X_KEY": "clave-del-entorno"}):
                with tenancy.tenant_context(TENANT):
                    self.assertEqual(
                        database.get_platform_setting("k", "X_KEY"),
                        "clave-del-negocio")

    def test_el_maestro_no_se_consulta_a_si_mismo(self):
        valores = {tenancy.MASTER_TENANT_ID: "clave-de-plataforma"}
        with patch.object(database, "get_setting", self._fake_get_setting(valores)):
            with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
                self.assertEqual(
                    database.get_platform_setting("k", "X_KEY"),
                    "clave-de-plataforma")

    def test_sin_nada_configurado_devuelve_el_default(self):
        with patch.object(database, "get_setting", self._fake_get_setting({})):
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("X_KEY", None)
                with tenancy.tenant_context(TENANT):
                    self.assertEqual(database.get_platform_setting("k", "X_KEY"), "")

    def test_espacios_en_blanco_no_cuentan_como_valor(self):
        valores = {TENANT: "   ", tenancy.MASTER_TENANT_ID: "clave-de-plataforma"}
        with patch.object(database, "get_setting", self._fake_get_setting(valores)):
            with tenancy.tenant_context(TENANT):
                self.assertEqual(
                    database.get_platform_setting("k", "X_KEY"),
                    "clave-de-plataforma")

    def test_sin_variable_de_entorno_declarada(self):
        with patch.object(database, "get_setting", self._fake_get_setting({})):
            with tenancy.tenant_context(TENANT):
                self.assertEqual(
                    database.get_platform_setting("k", default="nada"), "nada")


if __name__ == "__main__":
    unittest.main()
