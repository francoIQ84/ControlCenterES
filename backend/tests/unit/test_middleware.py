"""
Tests unitarios del TenantResolver (src/middleware.py).

Se invoca el middleware como ASGI puro, sin servidor ni base de datos: el
registro de tenants está mockeado. Lo que se verifica es el ruteo — qué tenant
queda en contexto para cada Host — y que el contexto se restaure siempre, que
es lo que evita que una petición contamine a la siguiente.
"""

import asyncio
import json
import unittest
from unittest.mock import patch

from src import tenancy
from src.middleware import TenantResolverMiddleware

MASTER = {
    "id": tenancy.MASTER_TENANT_ID,
    "slug": "hidroponia",
    "name": "Hidroponía Rosario",
    "status": "active",
    "plan_id": "master",
}
ACME = {
    "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "slug": "acme",
    "name": "Acme",
    "status": "active",
    "plan_id": "pro",
}


def build_scope(host=None, scope_type="http", path="/api/inventory/"):
    headers = []
    if host is not None:
        headers.append((b"host", host.encode("latin-1")))
    return {"type": scope_type, "path": path, "headers": headers, "method": "GET"}


class Harness:
    """Aplicación descendente de mentira: anota el tenant que veía al ser
    invocada y devuelve 200."""

    def __init__(self):
        self.seen_tenant_id = None
        self.seen_scope = None
        self.called = False

    async def __call__(self, scope, receive, send):
        self.called = True
        self.seen_tenant_id = tenancy.get_current_tenant_id()
        self.seen_scope = scope
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})


async def call_middleware(middleware, scope):
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    await middleware(scope, receive, send)
    return sent


def response_status(sent):
    for message in sent:
        if message["type"] == "http.response.start":
            return message["status"]
    return None


def response_body(sent):
    body = b"".join(m.get("body", b"") for m in sent
                    if m["type"] == "http.response.body")
    return json.loads(body) if body else None


class TenantResolutionTest(unittest.TestCase):
    def setUp(self):
        self.app = Harness()
        self.middleware = TenantResolverMiddleware(self.app)
        patcher = patch.object(tenancy, "get_master_tenant", return_value=MASTER)
        self.addCleanup(patcher.stop)
        patcher.start()

    def run_request(self, host, **kwargs):
        return asyncio.run(call_middleware(self.middleware,
                                           build_scope(host, **kwargs)))

    def test_sin_subdominio_resuelve_al_maestro(self):
        """Es lo que mantiene andando la operación actual: hoy nadie entra por
        subdominio."""
        sent = self.run_request("localhost:8090")
        self.assertEqual(response_status(sent), 200)
        self.assertEqual(self.app.seen_tenant_id, tenancy.MASTER_TENANT_ID)

    def test_sin_header_host_resuelve_al_maestro(self):
        self.run_request(None)
        self.assertEqual(self.app.seen_tenant_id, tenancy.MASTER_TENANT_ID)

    def test_subdominio_resuelve_al_inquilino(self):
        with patch.object(tenancy, "get_tenant_by_slug", return_value=ACME):
            sent = self.run_request("acme.controlcenter.app")
        self.assertEqual(response_status(sent), 200)
        self.assertEqual(self.app.seen_tenant_id, ACME["id"])

    def test_el_tenant_queda_en_el_scope(self):
        with patch.object(tenancy, "get_tenant_by_slug", return_value=ACME):
            self.run_request("acme.controlcenter.app")
        self.assertEqual(self.app.seen_scope["tenant"]["slug"], "acme")
        self.assertEqual(self.app.seen_scope["tenant_source"], "host")

    def test_tenant_inexistente_devuelve_404(self):
        with patch.object(tenancy, "get_tenant_by_slug", return_value=None):
            sent = self.run_request("fantasma.controlcenter.app")
        self.assertEqual(response_status(sent), 404)
        self.assertIn("fantasma", response_body(sent)["detail"])
        self.assertFalse(self.app.called,
                         "la aplicación no debe ejecutarse con un tenant inválido")

    def test_tenant_suspendido_devuelve_403(self):
        suspended = {**ACME, "status": "suspended"}
        with patch.object(tenancy, "get_tenant_by_slug", return_value=suspended):
            sent = self.run_request("acme.controlcenter.app")
        self.assertEqual(response_status(sent), 403)
        self.assertIn("suspended", response_body(sent)["detail"])
        self.assertFalse(self.app.called)

    def test_tenant_en_trial_pasa(self):
        trial = {**ACME, "status": "trial"}
        with patch.object(tenancy, "get_tenant_by_slug", return_value=trial):
            sent = self.run_request("acme.controlcenter.app")
        self.assertEqual(response_status(sent), 200)
        self.assertTrue(self.app.called)

    def test_tenant_cancelado_devuelve_403(self):
        cancelled = {**ACME, "status": "cancelled"}
        with patch.object(tenancy, "get_tenant_by_slug", return_value=cancelled):
            sent = self.run_request("acme.controlcenter.app")
        self.assertEqual(response_status(sent), 403)

    def test_el_contexto_se_restaura_despues_de_la_peticion(self):
        with patch.object(tenancy, "get_tenant_by_slug", return_value=ACME):
            self.run_request("acme.controlcenter.app")
        self.assertEqual(tenancy.get_current_tenant_id(), tenancy.MASTER_TENANT_ID)

    def test_el_contexto_se_restaura_aunque_la_app_falle(self):
        """Si una excepción dejara el contexto colgado, la petición siguiente
        del mismo worker leería datos del inquilino anterior."""
        class Exploding:
            async def __call__(self, scope, receive, send):
                raise RuntimeError("boom")

        middleware = TenantResolverMiddleware(Exploding())
        with patch.object(tenancy, "get_tenant_by_slug", return_value=ACME):
            with self.assertRaises(RuntimeError):
                asyncio.run(call_middleware(
                    middleware, build_scope("acme.controlcenter.app")))
        self.assertEqual(tenancy.get_current_tenant_id(), tenancy.MASTER_TENANT_ID)

    def test_lifespan_pasa_de_largo(self):
        scope = {"type": "lifespan"}
        asyncio.run(call_middleware(self.middleware, scope))
        self.assertTrue(self.app.called)

    def test_websocket_de_tenant_invalido_se_cierra(self):
        with patch.object(tenancy, "get_tenant_by_slug", return_value=None):
            sent = asyncio.run(call_middleware(
                self.middleware,
                build_scope("fantasma.controlcenter.app", scope_type="websocket")))
        self.assertEqual(sent[0]["type"], "websocket.close")
        self.assertFalse(self.app.called)


class TrustHeaderTest(unittest.TestCase):
    """X-Tenant-Slug solo debe funcionar cuando se habilita explícitamente:
    de lo contrario cualquiera elegiría qué inquilino leer."""

    def setUp(self):
        self.app = Harness()
        patcher = patch.object(tenancy, "get_master_tenant", return_value=MASTER)
        self.addCleanup(patcher.stop)
        patcher.start()

    def _run(self, trust_header):
        middleware = TenantResolverMiddleware(self.app, trust_header=trust_header)
        scope = build_scope("localhost:8090")
        scope["headers"].append((b"x-tenant-slug", b"acme"))
        with patch.object(tenancy, "get_tenant_by_slug", return_value=ACME):
            return asyncio.run(call_middleware(middleware, scope))

    def test_ignorado_por_defecto(self):
        self._run(trust_header=False)
        self.assertEqual(self.app.seen_tenant_id, tenancy.MASTER_TENANT_ID)

    def test_respetado_cuando_se_habilita(self):
        self._run(trust_header=True)
        self.assertEqual(self.app.seen_tenant_id, ACME["id"])
        self.assertEqual(self.app.seen_scope["tenant_source"], "header")

    def test_el_host_tiene_prioridad_sobre_el_header(self):
        middleware = TenantResolverMiddleware(self.app, trust_header=True)
        scope = build_scope("acme.controlcenter.app")
        scope["headers"].append((b"x-tenant-slug", b"otro"))
        with patch.object(tenancy, "get_tenant_by_slug", return_value=ACME) as mock:
            asyncio.run(call_middleware(middleware, scope))
        mock.assert_called_once_with("acme")


if __name__ == "__main__":
    unittest.main()
