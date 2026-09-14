"""
Tests unitarios de la validación de entrada de la API multi-tenant.

El slug es lo que va a terminar siendo un subdominio público y la clave de
ruteo de cada inquilino, así que la validación de alta se prueba a fondo: un
slug mal formado o reservado rompe el ruteo de todos.
"""

import unittest

from pydantic import ValidationError

from src import integrations
from src.api.tenants import (ALL_MODULES, DEFAULT_MODULES, TenantCreate,
                             TenantModulesUpdate, TenantStatusUpdate)


def make_payload(**overrides):
    data = {"slug": "acme", "name": "Acme SRL", "admin_password": "clave-larga-1"}
    data.update(overrides)
    return data


class TenantCreateSlugTest(unittest.TestCase):
    def test_slug_valido(self):
        self.assertEqual(TenantCreate(**make_payload(slug="acme")).slug, "acme")

    def test_normaliza_a_minusculas_y_recorta(self):
        self.assertEqual(TenantCreate(**make_payload(slug="  ACME  ")).slug, "acme")

    def test_acepta_guiones_y_numeros(self):
        self.assertEqual(
            TenantCreate(**make_payload(slug="vivero-2000")).slug, "vivero-2000")

    def test_rechaza_slugs_mal_formados(self):
        for bad in ("", "a", "-empieza-con-guion", "con espacio", "con_guion_bajo",
                    "con.punto", "MAYUS!", "á-con-acento", "x" * 64):
            with self.subTest(slug=bad):
                with self.assertRaises(ValidationError):
                    TenantCreate(**make_payload(slug=bad))

    def test_rechaza_subdominios_reservados(self):
        for reserved in ("www", "api", "admin", "app", "mail", "static"):
            with self.subTest(slug=reserved):
                with self.assertRaises(ValidationError):
                    TenantCreate(**make_payload(slug=reserved))

    def test_el_slug_reservado_se_detecta_tambien_en_mayusculas(self):
        with self.assertRaises(ValidationError):
            TenantCreate(**make_payload(slug="WWW"))


class TenantCreatePasswordTest(unittest.TestCase):
    def test_rechaza_una_contrasena_corta(self):
        with self.assertRaises(ValidationError):
            TenantCreate(**make_payload(admin_password="corta"))

    def test_acepta_una_contrasena_de_ocho_caracteres(self):
        self.assertEqual(
            TenantCreate(**make_payload(admin_password="12345678")).admin_password,
            "12345678")

    def test_la_contrasena_es_obligatoria(self):
        data = make_payload()
        data.pop("admin_password")
        with self.assertRaises(ValidationError):
            TenantCreate(**data)


class TenantCreateDefaultsTest(unittest.TestCase):
    def test_valores_por_defecto(self):
        payload = TenantCreate(**make_payload())
        self.assertEqual(payload.plan_id, "starter")
        self.assertEqual(payload.admin_username, "admin")
        self.assertIsNone(payload.active_modules)

    def test_modulos_por_defecto_son_un_subconjunto_de_los_validos(self):
        self.assertTrue(set(DEFAULT_MODULES).issubset(set(ALL_MODULES)))


class ModuleValidationTest(unittest.TestCase):
    def test_acepta_modulos_conocidos(self):
        payload = TenantCreate(**make_payload(
            active_modules=["inventory", "sales"]))
        self.assertEqual(payload.active_modules, ["inventory", "sales"])

    def test_rechaza_un_modulo_inexistente(self):
        with self.assertRaises(ValidationError) as ctx:
            TenantCreate(**make_payload(active_modules=["inventory", "criptomonedas"]))
        self.assertIn("criptomonedas", str(ctx.exception))

    def test_acepta_lista_vacia(self):
        self.assertEqual(TenantCreate(**make_payload(active_modules=[])).active_modules,
                         [])

    def test_update_de_modulos_valida_igual(self):
        self.assertEqual(
            TenantModulesUpdate(active_modules=["billing"]).active_modules, ["billing"])
        with self.assertRaises(ValidationError):
            TenantModulesUpdate(active_modules=["inexistente"])


class TenantStatusTest(unittest.TestCase):
    def test_estados_validos(self):
        for status in ("active", "suspended", "trial", "cancelled"):
            with self.subTest(status=status):
                self.assertEqual(TenantStatusUpdate(status=status).status, status)

    def test_estados_invalidos(self):
        for status in ("borrado", "ACTIVE", "", "paused"):
            with self.subTest(status=status):
                with self.assertRaises(ValidationError):
                    TenantStatusUpdate(status=status)


class MasterSeedConsistencyTest(unittest.TestCase):
    """El Tenant Maestro debe tener sembrados TODOS los módulos.

    El frontend esconde del menú lo que no figure en `active_modules`. Si la
    semilla de la migración omite uno, esa sección desaparece del panel de la
    operación que ya estaba andando. Pasó con `dashboard`, así que se ata la
    semilla SQL a la lista de módulos del código.
    """

    def _seeded_modules(self):
        import json
        import os
        import re

        sql_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "migrations", "001_multitenancy.sql")
        with open(sql_path, encoding="utf-8") as fh:
            sql = fh.read()

        match = re.search(
            r"INSERT INTO tenant_settings.*?VALUES\s*\([^,]+,\s*'(\[.*?\])'::jsonb",
            sql, re.DOTALL)
        self.assertIsNotNone(match, "no se encontró la semilla de tenant_settings")
        return set(json.loads(re.sub(r"\s+", "", match.group(1))))

    def test_la_semilla_cubre_todos_los_modulos(self):
        seeded = self._seeded_modules()
        missing = set(ALL_MODULES) - seeded
        self.assertEqual(missing, set(),
                         f"la migración no siembra estos módulos: {sorted(missing)}")

    def test_la_semilla_no_inventa_modulos(self):
        extra = self._seeded_modules() - set(ALL_MODULES)
        self.assertEqual(extra, set(),
                         f"la migración siembra módulos desconocidos: {sorted(extra)}")


class ProviderValidationTest(unittest.TestCase):
    def test_acepta_los_proveedores_soportados(self):
        for provider in integrations.PROVIDERS:
            with self.subTest(provider=provider):
                self.assertEqual(integrations._check_provider(provider), provider)

    def test_normaliza_mayusculas_y_espacios(self):
        self.assertEqual(integrations._check_provider("  MercadoLibre  "),
                         "mercadolibre")

    def test_rechaza_un_proveedor_desconocido(self):
        for bad in ("paypal", "", None, "mercado libre"):
            with self.subTest(provider=bad):
                with self.assertRaises(integrations.UnknownProvider):
                    integrations._check_provider(bad)

    def test_el_error_enumera_los_validos(self):
        with self.assertRaises(integrations.UnknownProvider) as ctx:
            integrations._check_provider("paypal")
        self.assertIn("mercadolibre", str(ctx.exception))

    def test_las_claves_heredadas_son_de_proveedores_validos(self):
        """Si un proveedor de LEGACY_SETTING_KEYS no estuviera en PROVIDERS, la
        lectura de compatibilidad fallaría en silencio."""
        for provider in integrations.LEGACY_SETTING_KEYS:
            with self.subTest(provider=provider):
                self.assertIn(provider, integrations.PROVIDERS)


if __name__ == "__main__":
    unittest.main()
