#!/usr/bin/env python
"""
Prueba end-to-end de la capa multi-tenant sobre la API real.

Cubre el alta de inquilinos, el aislamiento entre ellos, el cifrado de
credenciales, la resolución de webhooks, los módulos por plan y el gating de
plataforma. Levanta la aplicación completa con TestClient, así que ejercita el
mismo camino que una petición HTTP de verdad: TenantResolver -> contexto ->
RLS.

Se ejecuta con el rol de aplicación (no superusuario), que es la única forma de
que las políticas RLS estén realmente activas::

    cd backend
    APP_DB_PASSWORD=... python -m tests.test_multitenancy

Crea un tenant descartable y lo elimina al terminar. Requiere que
001_multitenancy.sql esté aplicada.
"""

import os
import sys
from urllib.parse import urlparse, urlunparse

TEST_SLUG = "zz-test-aislamiento"
TEST_ADMIN_PASSWORD = "clave-de-prueba-1"

_results = []


def check(name, ok, detail=""):
    _results.append((name, bool(ok), detail))
    print(f"  [{'OK ' if ok else 'FALLA'}] {name}" + (f"  ({detail})" if detail else ""))


def _count_products(response):
    body = response.json()
    if isinstance(body, list):
        return len(body)
    return len(body.get("products", []))


def main():
    from dotenv import load_dotenv

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(backend_dir)
    sys.path.insert(0, backend_dir)
    load_dotenv(os.path.join(backend_dir, ".env"))

    admin_url = os.environ.get("DATABASE_URL")
    app_password = os.environ.get("APP_DB_PASSWORD")
    if not admin_url:
        print("ERROR: falta DATABASE_URL")
        return 1
    if not app_password:
        print("ERROR: falta APP_DB_PASSWORD (contraseña del rol controlcenter_app)")
        return 1

    # La app corre como controlcenter_app: sin esto RLS no se aplicaría y la
    # prueba pasaría en verde sin demostrar nada.
    p = urlparse(admin_url)
    os.environ["DATABASE_URL"] = urlunparse((
        p.scheme,
        f"controlcenter_app:{app_password}@{p.hostname}:{p.port or 5432}",
        p.path, "", "", ""))
    os.environ["TENANT_TRUST_HEADER"] = "1"

    from src.utils import crypto
    if not crypto.is_configured():
        # Clave efímera: la prueba solo necesita demostrar el round-trip.
        os.environ[crypto.ENV_KEY_NAME] = crypto.generate_key()

    print("\n  Multi-tenancy end-to-end")
    print("  " + "=" * 66)

    # ---------------------------------------------------------------- cifrado
    print("\n  Cifrado de credenciales (AES-256-GCM)")
    blob = crypto.encrypt_json({"access_token": "APP_USR-secreto"}, "tenant-a")
    check("Round-trip cifrado/descifrado",
          crypto.decrypt_json(blob, "tenant-a")["access_token"] == "APP_USR-secreto")
    check("El ciphertext no contiene el secreto", "APP_USR-secreto" not in blob)
    try:
        crypto.decrypt_json(blob, "tenant-b")
        check("Un blob de otro tenant no descifra", False, "descifró igual")
    except crypto.DecryptionFailed:
        check("Un blob de otro tenant no descifra", True, "AAD ligado al tenant")

    # ------------------------------------------------------------------- app
    from fastapi.testclient import TestClient
    from src import tenancy, integrations
    import main

    client = TestClient(main.app)
    master_host = {"Host": "localhost:8090"}
    tenant_host = {"Host": f"{TEST_SLUG}.controlcenter.app"}

    print("\n  Sesión de plataforma")
    r = client.post("/api/auth/login",
                    json={"username": "admin", "password": "admin123"},
                    headers=master_host)
    if r.status_code != 200:
        print(f"  No se pudo autenticar como admin del Tenant Maestro: {r.text[:200]}")
        print("  (la prueba asume el usuario admin por defecto)")
        return 1
    MH = {**master_host, "Authorization": f"Bearer {r.json()['token']}"}
    check("Login del Tenant Maestro", True)

    r = client.get("/api/tenants/me", headers=MH)
    check("/tenants/me reconoce al maestro",
          r.status_code == 200 and r.json().get("is_master") is True)

    # Limpieza defensiva de una corrida anterior interrumpida
    _drop_test_tenant(admin_url)

    print("\n  Alta de inquilino")
    r = client.post("/api/tenants/", headers=MH, json={
        "slug": TEST_SLUG,
        "name": "Tenant de prueba",
        "plan_id": "pro",
        "active_modules": ["dashboard", "inventory", "sales", "settings"],
        "admin_username": "admin",
        "admin_password": TEST_ADMIN_PASSWORD,
    })
    check("POST /tenants/ crea el inquilino", r.status_code == 200, r.text[:100])
    if r.status_code != 200:
        return 1
    tenant = r.json()["tenant"]

    check("Rechaza slug duplicado",
          client.post("/api/tenants/", headers=MH,
                      json={"slug": TEST_SLUG, "name": "dup",
                            "admin_password": "otra-clave-1"}).status_code == 409)
    check("Rechaza subdominio reservado",
          client.post("/api/tenants/", headers=MH,
                      json={"slug": "www", "name": "x",
                            "admin_password": "otra-clave-1"}).status_code == 422)

    try:
        print("\n  Aislamiento de datos")
        r = client.post("/api/auth/login",
                        json={"username": "admin", "password": TEST_ADMIN_PASSWORD},
                        headers=tenant_host)
        check("El admin del inquilino entra por su subdominio", r.status_code == 200)
        tenant_token = r.json().get("token", "")
        TH = {**tenant_host, "Authorization": f"Bearer {tenant_token}"}

        n_tenant = _count_products(client.get("/api/inventory/", headers=TH))
        n_master = _count_products(client.get("/api/inventory/", headers=MH))
        check("El inquilino nuevo no ve productos ajenos", n_tenant == 0,
              f"{n_tenant} productos")
        check("El maestro sigue viendo los suyos", n_master > 0,
              f"{n_master} productos")

        r = client.get("/api/auth/profile",
                       headers={**master_host, "Authorization": f"Bearer {tenant_token}"})
        check("Un token de un tenant no sirve en otro", r.status_code == 401,
              f"HTTP {r.status_code}")

        print("\n  Gating de plataforma")
        check("El inquilino no puede listar tenants",
              client.get("/api/tenants/", headers=TH).status_code == 403)
        check("El inquilino no puede crear tenants",
              client.post("/api/tenants/", headers=TH,
                          json={"slug": "otro", "name": "x",
                                "admin_password": "clave-larga-1"}).status_code == 403)
        check("El inquilino no accede a los respaldos",
              client.get("/api/backup/list", headers=TH).status_code == 403)
        check("El maestro sí accede a los respaldos",
              client.get("/api/backup/list", headers=MH).status_code == 200)

        print("\n  Credenciales cifradas")
        r = client.put("/api/integrations/mercadolibre", headers=TH, json={
            "credentials": {"client_id": "111", "client_secret": "SECRETO-DE-PRUEBA"},
            "external_account_id": "987654321"})
        check("El inquilino guarda credenciales", r.status_code == 200, r.text[:100])

        r = client.get("/api/integrations/", headers=TH)
        check("El listado no expone secretos", "SECRETO-DE-PRUEBA" not in r.text)

        with tenancy.tenant_context(tenant["id"]):
            creds = integrations.get_credentials("mercadolibre")
        check("El dueño recupera sus credenciales",
              bool(creds) and creds.get("client_secret") == "SECRETO-DE-PRUEBA")

        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            other = integrations.get_credentials("mercadolibre", allow_legacy=False)
            resolved = integrations.resolve_tenant_by_account("mercadolibre", "987654321")
            unknown = integrations.resolve_tenant_by_account("mercadolibre", "000000")
        check("Otro tenant no ve esas credenciales", other is None)

        print("\n  Webhooks y planes")
        check("Un webhook resuelve al tenant dueño de la cuenta",
              resolved == tenant["id"])
        check("Una cuenta desconocida no resuelve a nadie", unknown is None)

        modules = tenancy.get_active_modules(tenant["id"])
        check("Solo los módulos contratados",
              set(modules) == {"dashboard", "inventory", "sales", "settings"},
              ", ".join(sorted(modules)))
        check("is_module_active respeta el plan",
              tenancy.is_module_active("inventory", tenant["id"])
              and not tenancy.is_module_active("marketing", tenant["id"]))

        print("\n  Suscripción")
        check("El maestro suspende al inquilino",
              client.patch(f"/api/tenants/{TEST_SLUG}/status", headers=MH,
                           json={"status": "suspended"}).status_code == 200)
        check("Un tenant suspendido queda bloqueado",
              client.get("/api/inventory/", headers=TH).status_code == 403)
        check("No se puede suspender el Tenant Maestro",
              client.patch("/api/tenants/hidroponia/status", headers=MH,
                           json={"status": "suspended"}).status_code == 400)
    finally:
        _drop_test_tenant(admin_url)

    print("\n  " + "=" * 66)
    failed = [r for r in _results if not r[1]]
    print(f"  {len(_results) - len(failed)}/{len(_results)} comprobaciones superadas.")
    if failed:
        print("\n  FALLARON:")
        for name, _, detail in failed:
            print(f"   - {name}  {detail}")
        return 1
    print("  Multi-tenancy verificada end-to-end.\n")
    return 0


def _drop_test_tenant(admin_url):
    """Borra el tenant de prueba en cascada. Usa el rol administrador porque
    controlcenter_app tiene revocado el DELETE sobre `tenants`."""
    import psycopg2
    conn = psycopg2.connect(admin_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tenants WHERE slug = %s", (TEST_SLUG,))
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
