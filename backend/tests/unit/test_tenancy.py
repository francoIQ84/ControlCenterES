"""
Tests unitarios de src/tenancy.py.

No tocan la base de datos: cubren la resolución de subdominios y el manejo del
contexto asíncrono, que es la lógica pura del módulo.
"""

import asyncio
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from src import tenancy


class ExtractSlugFromHostTest(unittest.TestCase):
    """La resolución del subdominio decide de qué cliente son los datos que se
    van a leer, así que conviene cubrirla caso por caso."""

    def test_subdominio_simple(self):
        self.assertEqual(tenancy.extract_slug_from_host("acme.controlcenter.app"), "acme")

    def test_subdominio_con_guiones_y_numeros(self):
        self.assertEqual(
            tenancy.extract_slug_from_host("vivero-2000.controlcenter.app"),
            "vivero-2000")

    def test_normaliza_mayusculas(self):
        self.assertEqual(
            tenancy.extract_slug_from_host("ACME.ControlCenter.App"), "acme")

    def test_descarta_el_puerto(self):
        self.assertEqual(
            tenancy.extract_slug_from_host("acme.controlcenter.app:8090"), "acme")

    def test_dominio_apex_no_es_tenant(self):
        self.assertIsNone(tenancy.extract_slug_from_host("controlcenter.app"))

    def test_subdominios_reservados(self):
        for host in ("www", "api", "admin", "app", "static", "mail"):
            with self.subTest(host=host):
                self.assertIsNone(
                    tenancy.extract_slug_from_host(f"{host}.controlcenter.app"))

    def test_localhost(self):
        self.assertIsNone(tenancy.extract_slug_from_host("localhost"))
        self.assertIsNone(tenancy.extract_slug_from_host("localhost:5173"))
        self.assertIsNone(tenancy.extract_slug_from_host("acme.localhost"))

    def test_ip_desnuda(self):
        self.assertIsNone(tenancy.extract_slug_from_host("138.36.238.70"))
        self.assertIsNone(tenancy.extract_slug_from_host("127.0.0.1:8090"))

    def test_ipv6_entre_corchetes(self):
        self.assertIsNone(tenancy.extract_slug_from_host("[::1]:8090"))

    def test_sub_sub_dominio_no_soportado(self):
        # Evita que "a.acme.controlcenter.app" se lea como el tenant "a.acme"
        self.assertIsNone(tenancy.extract_slug_from_host("a.b.controlcenter.app"))

    def test_dominio_ajeno(self):
        self.assertIsNone(tenancy.extract_slug_from_host("acme.otrodominio.com"))

    def test_vacios(self):
        self.assertIsNone(tenancy.extract_slug_from_host(None))
        self.assertIsNone(tenancy.extract_slug_from_host(""))

    def test_toma_el_primer_host_de_una_lista(self):
        # Algunos proxys concatenan varios valores en el header Host
        self.assertEqual(
            tenancy.extract_slug_from_host("acme.controlcenter.app, otro.com"),
            "acme")

    def test_slug_invalido_se_descarta(self):
        # Empieza con guion: no cumple el formato de slug
        self.assertIsNone(tenancy.extract_slug_from_host("-mal.controlcenter.app"))

    def test_slug_de_un_solo_caracter_se_descarta(self):
        self.assertIsNone(tenancy.extract_slug_from_host("a.controlcenter.app"))


class ValidTenantIdTest(unittest.TestCase):
    def test_uuid_valido(self):
        self.assertTrue(tenancy.is_valid_tenant_id(tenancy.MASTER_TENANT_ID))
        self.assertTrue(
            tenancy.is_valid_tenant_id("A0C1B1E6-A8BA-49AD-85DD-F70F4D4715E2"))

    def test_valores_invalidos(self):
        for value in (None, "", "no-es-uuid", 12345,
                      "00000000-0000-0000-0000-00000000000",   # falta un dígito
                      "gggggggg-0000-0000-0000-000000000001"):  # no es hex
            with self.subTest(value=value):
                self.assertFalse(tenancy.is_valid_tenant_id(value))


class TenantContextTest(unittest.TestCase):
    OTHER = "11111111-2222-3333-4444-555555555555"

    def test_por_defecto_es_el_tenant_maestro(self):
        self.assertEqual(tenancy.get_current_tenant_id(), tenancy.MASTER_TENANT_ID)

    def test_context_manager_fija_y_restaura(self):
        with tenancy.tenant_context(self.OTHER):
            self.assertEqual(tenancy.get_current_tenant_id(), self.OTHER)
        self.assertEqual(tenancy.get_current_tenant_id(), tenancy.MASTER_TENANT_ID)

    def test_restaura_aunque_el_bloque_falle(self):
        """Si una excepción dejara el contexto colgado, la siguiente operación
        escribiría en el tenant equivocado."""
        with self.assertRaises(ValueError):
            with tenancy.tenant_context(self.OTHER):
                raise ValueError("algo falló")
        self.assertEqual(tenancy.get_current_tenant_id(), tenancy.MASTER_TENANT_ID)

    def test_anidado(self):
        inner = "99999999-8888-7777-6666-555555555555"
        with tenancy.tenant_context(self.OTHER):
            with tenancy.tenant_context(inner):
                self.assertEqual(tenancy.get_current_tenant_id(), inner)
            self.assertEqual(tenancy.get_current_tenant_id(), self.OTHER)
        self.assertEqual(tenancy.get_current_tenant_id(), tenancy.MASTER_TENANT_ID)

    def test_guarda_el_objeto_tenant(self):
        tenant = {"id": self.OTHER, "slug": "acme", "name": "Acme"}
        with tenancy.tenant_context(self.OTHER, tenant):
            self.assertEqual(tenancy.get_current_tenant(), tenant)
        self.assertIsNone(tenancy.get_current_tenant())

    def test_rechaza_un_tenant_id_invalido(self):
        """Mejor romper acá que dejar que un valor basura llegue al SET de la
        conexión."""
        with self.assertRaises(ValueError):
            tenancy.set_current_tenant("no-es-uuid")

    def test_no_se_filtra_entre_hilos(self):
        """El scheduler corre en hilos aparte: el contexto de uno no puede
        contaminar al otro."""
        observed = {}
        barrier = threading.Barrier(2)

        def worker(name, tenant_id):
            with tenancy.tenant_context(tenant_id):
                barrier.wait()          # los dos dentro de su contexto a la vez
                observed[name] = tenancy.get_current_tenant_id()

        a = threading.Thread(target=worker, args=("a", self.OTHER))
        b = threading.Thread(target=worker,
                             args=("b", "77777777-7777-7777-7777-777777777777"))
        a.start(); b.start(); a.join(); b.join()

        self.assertEqual(observed["a"], self.OTHER)
        self.assertEqual(observed["b"], "77777777-7777-7777-7777-777777777777")

    def test_se_propaga_al_threadpool(self):
        """FastAPI ejecuta los endpoints síncronos en un threadpool: si el
        contexto no viajara, las consultas usarían el tenant equivocado."""
        with tenancy.tenant_context(self.OTHER):
            with ThreadPoolExecutor(max_workers=1) as pool:
                import contextvars
                ctx = contextvars.copy_context()
                result = pool.submit(ctx.run, tenancy.get_current_tenant_id).result()
        self.assertEqual(result, self.OTHER)

    def test_aislado_entre_tareas_asyncio(self):
        async def scenario():
            async def task(tenant_id):
                with tenancy.tenant_context(tenant_id):
                    await asyncio.sleep(0)
                    return tenancy.get_current_tenant_id()

            return await asyncio.gather(
                task(self.OTHER),
                task("66666666-6666-6666-6666-666666666666"))

        results = asyncio.run(scenario())
        self.assertEqual(results,
                         [self.OTHER, "66666666-6666-6666-6666-666666666666"])


class ModuleGatingTest(unittest.TestCase):
    TENANT = "11111111-2222-3333-4444-555555555555"

    def setUp(self):
        tenancy.invalidate_module_cache()

    def tearDown(self):
        tenancy.invalidate_module_cache()

    @patch.object(tenancy, "get_active_modules")
    def test_modulo_contratado(self, mock_modules):
        mock_modules.return_value = ["inventory", "sales"]
        self.assertTrue(tenancy.is_module_active("inventory", self.TENANT))
        self.assertFalse(tenancy.is_module_active("marketing", self.TENANT))

    @patch.object(tenancy, "get_active_modules")
    def test_sin_configuracion_no_apaga_nada(self, mock_modules):
        """Mientras tenant_settings no esté poblado no se puede apagar
        funcionalidad que hoy está en uso."""
        mock_modules.return_value = []
        self.assertTrue(tenancy.is_module_active("marketing", self.TENANT))


class CacheTest(unittest.TestCase):
    def setUp(self):
        tenancy.invalidate_tenant_cache()

    def tearDown(self):
        tenancy.invalidate_tenant_cache()

    def test_la_invalidacion_por_slug_no_borra_los_demas(self):
        tenancy._cache_put(("slug", "acme"), {"id": "x"})
        tenancy._cache_put(("slug", "otro"), {"id": "y"})
        tenancy.invalidate_tenant_cache("acme")
        self.assertIsNone(tenancy._cache_get(("slug", "acme")))
        self.assertIsNotNone(tenancy._cache_get(("slug", "otro")))

    def test_la_invalidacion_total_limpia_todo(self):
        tenancy._cache_put(("slug", "acme"), {"id": "x"})
        tenancy.invalidate_tenant_cache()
        self.assertIsNone(tenancy._cache_get(("slug", "acme")))

    def test_la_entrada_vencida_no_se_devuelve(self):
        import time
        with patch.object(tenancy, "_CACHE_TTL_SECONDS", -1):
            tenancy._cache_put(("slug", "acme"), {"id": "x"})
        self.assertIsNone(tenancy._cache_get(("slug", "acme")))

    def test_invalidate_module_cache_no_toca_los_slugs(self):
        tenancy._cache_put(("slug", "acme"), {"id": "x"})
        tenancy._cache_put(("modules", "abc"), ["inventory"])
        tenancy.invalidate_module_cache()
        self.assertIsNotNone(tenancy._cache_get(("slug", "acme")))
        self.assertIsNone(tenancy._cache_get(("modules", "abc")))


if __name__ == "__main__":
    unittest.main()


class PlanLimitsTest(unittest.TestCase):
    """Topes del plan contratado.

    Los planes se venden con topes ("Hasta 150 productos") pero hasta ahora no
    había nada que los leyera: eran texto de marketing. El criterio por defecto
    tiene que seguir siendo no cortar nada, para no romper a quien ya está
    operando.
    """

    TENANT = "11111111-2222-3333-4444-555555555555"

    def setUp(self):
        tenancy.invalidate_limits_cache()

    def tearDown(self):
        tenancy.invalidate_limits_cache()

    @patch.object(tenancy, "get_plan_limits")
    def test_tope_configurado(self, mock_limits):
        mock_limits.return_value = {"products": 150}
        self.assertEqual(tenancy.get_plan_limit("products", self.TENANT), 150)

    @patch.object(tenancy, "get_plan_limits")
    def test_sin_tope_configurado(self, mock_limits):
        mock_limits.return_value = {}
        self.assertIsNone(tenancy.get_plan_limit("products", self.TENANT))

    @patch.object(tenancy, "get_plan_limits")
    def test_recurso_no_listado_no_tiene_tope(self, mock_limits):
        mock_limits.return_value = {"products": 150}
        self.assertIsNone(tenancy.get_plan_limit("users", self.TENANT))

    @patch.object(tenancy, "get_plan_limits")
    def test_cero_y_negativos_significan_sin_tope(self, mock_limits):
        """Un 0 guardado por error no puede dejar a un negocio sin poder
        cargar nada."""
        for valor in (0, -1, None, "", "abc"):
            mock_limits.return_value = {"products": valor}
            self.assertIsNone(tenancy.get_plan_limit("products", self.TENANT),
                              f"valor {valor!r} debería significar sin tope")

    @patch.object(tenancy, "get_plan_limits")
    def test_numero_como_texto(self, mock_limits):
        """JSONB puede devolver el valor como cadena según cómo se haya
        guardado."""
        mock_limits.return_value = {"products": "150"}
        self.assertEqual(tenancy.get_plan_limit("products", self.TENANT), 150)

    @patch.object(tenancy, "get_plan_limits")
    def test_el_maestro_nunca_tiene_tope(self, mock_limits):
        """Es la operación propia, no un cliente con un plan contratado."""
        mock_limits.return_value = {"products": 1}
        self.assertIsNone(
            tenancy.get_plan_limit("products", tenancy.MASTER_TENANT_ID))

    def test_la_invalidacion_de_limites_no_toca_las_demas_entradas(self):
        tenancy._cache_put(("limits", self.TENANT), {"products": 10})
        tenancy._cache_put(("slug", "acme"), {"id": self.TENANT})
        tenancy.invalidate_limits_cache(self.TENANT)
        self.assertIsNone(tenancy._cache_get(("limits", self.TENANT)))
        self.assertIsNotNone(tenancy._cache_get(("slug", "acme")))
