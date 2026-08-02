"""
TenantResolver: middleware ASGI que identifica al inquilino de cada petición.

Está escrito como middleware ASGI puro y no con `BaseHTTPMiddleware` a
propósito. `BaseHTTPMiddleware` ejecuta la aplicación descendente en otra
tarea de anyio, y los ContextVar fijados en `dispatch()` no siempre se
propagan hasta el endpoint. Un middleware ASGI puro corre en la misma tarea,
así que el contexto de tenant llega intacto a `database.get_connection()`.
"""

import json

from src import tenancy


class TenantResolverMiddleware:
    """Resuelve el tenant por subdominio y lo publica en el contexto asíncrono.

    Orden de resolución:

    1. Subdominio del header Host (`{slug}.controlcenter.app`).
    2. Header `X-Tenant-Slug`, solo si `trust_header=True`. Sirve para
       desarrollo local y para pruebas automatizadas, donde no hay DNS de
       subdominios. Nunca debe habilitarse de cara a Internet: cualquiera
       podría elegir el tenant que quiere leer.
    3. Tenant Maestro (Hidroponía Rosario).

    El paso 3 es lo que hace que este cambio sea no destructivo: hoy nadie
    entra por subdominio, así que todo el tráfico actual sigue resolviendo al
    tenant de siempre y la operación no se entera de nada.
    """

    def __init__(self, app, trust_header: bool = False):
        self.app = app
        self.trust_header = trust_header

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                   for k, v in scope.get("headers", [])}

        slug = tenancy.extract_slug_from_host(headers.get("host"))
        source = "host"

        if slug is None and self.trust_header:
            candidate = headers.get("x-tenant-slug")
            if candidate:
                slug = candidate.strip().lower()
                source = "header"

        if slug is None:
            tenant = tenancy.get_master_tenant()
        else:
            tenant = tenancy.get_tenant_by_slug(slug)
            if tenant is None:
                await self._reject(scope, receive, send, 404,
                                   f"Tenant '{slug}' inexistente")
                return
            if tenant.get("status") not in ("active", "trial"):
                await self._reject(
                    scope, receive, send, 403,
                    f"La suscripción de '{slug}' está {tenant.get('status')}")
                return

        scope["tenant"] = tenant
        scope["tenant_source"] = source

        tokens = tenancy.set_current_tenant(tenant["id"], tenant)
        try:
            await self.app(scope, receive, send)
        finally:
            tenancy.reset_current_tenant(tokens)

    async def _reject(self, scope, receive, send, status, detail):
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        body = json.dumps({"detail": detail}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("latin-1")),
            ],
        })
        await send({"type": "http.response.body", "body": body})
