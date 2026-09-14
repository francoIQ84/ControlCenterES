"""
Tests unitarios del recorrido multi-tenant del scheduler.

Lo que se prueba no es la sincronización en sí (eso pega contra APIs externas),
sino la garantía que hace que el scheduler sea usable con varios clientes: cada
tarea corre bajo el contexto de su inquilino, y el fallo de uno no interrumpe a
los demás.
"""

import unittest
from unittest.mock import patch

from src import scheduler, tenancy

TENANT_A = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "slug": "acme",
            "name": "Acme", "status": "active"}
TENANT_B = {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "slug": "vivero",
            "name": "Vivero", "status": "active"}
TENANT_C = {"id": "cccccccc-cccc-cccc-cccc-cccccccccccc", "slug": "hidro",
            "name": "Hidro", "status": "active"}


class ForEachTenantTest(unittest.TestCase):
    def test_ejecuta_una_vez_por_tenant(self):
        seen = []
        with patch.object(tenancy, "list_active_tenants",
                          return_value=[TENANT_A, TENANT_B]):
            count = scheduler._for_each_tenant("Prueba", lambda t: seen.append(t["slug"]))
        self.assertEqual(count, 2)
        self.assertEqual(seen, ["acme", "vivero"])

    def test_cada_tarea_corre_bajo_el_contexto_de_su_tenant(self):
        """Si el contexto no se fijara, todas las sincronizaciones escribirían
        sobre los datos del Tenant Maestro."""
        observed = {}

        def task(tenant):
            observed[tenant["slug"]] = tenancy.get_current_tenant_id()

        with patch.object(tenancy, "list_active_tenants",
                          return_value=[TENANT_A, TENANT_B]):
            scheduler._for_each_tenant("Prueba", task)

        self.assertEqual(observed["acme"], TENANT_A["id"])
        self.assertEqual(observed["vivero"], TENANT_B["id"])

    def test_un_tenant_que_falla_no_frena_a_los_demas(self):
        """El caso real: a un cliente se le vence el token de Mercado Libre y
        el resto tiene que sincronizar igual."""
        seen = []

        def task(tenant):
            seen.append(tenant["slug"])
            if tenant["slug"] == "vivero":
                raise RuntimeError("token vencido")

        with patch.object(tenancy, "list_active_tenants",
                          return_value=[TENANT_A, TENANT_B, TENANT_C]):
            count = scheduler._for_each_tenant("Prueba", task)

        self.assertEqual(seen, ["acme", "vivero", "hidro"])
        self.assertEqual(count, 3)

    def test_el_contexto_se_restaura_tras_un_fallo(self):
        def task(tenant):
            raise RuntimeError("boom")

        with patch.object(tenancy, "list_active_tenants", return_value=[TENANT_A]):
            scheduler._for_each_tenant("Prueba", task)

        self.assertEqual(tenancy.get_current_tenant_id(), tenancy.MASTER_TENANT_ID)

    def test_sin_tenants_activos_no_hace_nada(self):
        called = []
        with patch.object(tenancy, "list_active_tenants", return_value=[]):
            count = scheduler._for_each_tenant("Prueba", lambda t: called.append(t))
        self.assertEqual(count, 0)
        self.assertEqual(called, [])


class MarketingLoopTest(unittest.TestCase):
    def test_una_publicacion_rota_no_frena_la_cola(self):
        posts = [{"id": 1}, {"id": 2}, {"id": 3}]
        published, failed = [], []

        def publish(post):
            if post["id"] == 2:
                raise RuntimeError("la API de Meta devolvió 500")
            return True, "ok"

        with patch("src.database.get_due_scheduled_marketing_posts", return_value=posts), \
             patch("src.utils.social_publisher.publish_post_to_all_platforms",
                   side_effect=publish), \
             patch("src.database.update_marketing_post_status") as mock_status:
            scheduler._publish_due_posts_for_tenant(TENANT_A)

        for call in mock_status.call_args_list:
            post_id, status = call.args[0], call.args[1]
            (published if status == "published" else failed).append(post_id)

        self.assertEqual(published, [1, 3])
        self.assertEqual(failed, [2],
                         "la publicación rota debe quedar marcada como fallida")

    def test_sin_publicaciones_pendientes_no_llama_al_publicador(self):
        with patch("src.database.get_due_scheduled_marketing_posts", return_value=[]), \
             patch("src.utils.social_publisher.publish_post_to_all_platforms") as pub:
            scheduler._publish_due_posts_for_tenant(TENANT_A)
        pub.assert_not_called()


if __name__ == "__main__":
    unittest.main()
