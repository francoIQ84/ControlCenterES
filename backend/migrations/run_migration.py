#!/usr/bin/env python
"""
Runner de migraciones multi-tenant para ControlCenter.

Pensado para correr contra una base con operación diaria activa, así que por
defecto no aplica nada: hay que pedirlo explícitamente.

    # 1. Ensayo general: aplica todo y hace ROLLBACK. No deja rastro.
    python -m migrations.run_migration --dry-run

    # 2. Aplicar de verdad (pide confirmación si el host no es local)
    python -m migrations.run_migration --apply

    # 3. Comprobar que el aislamiento funciona de verdad
    python -m migrations.run_migration --verify

    # 4. Marcha atrás
    python -m migrations.run_migration --rollback

Se ejecuta desde el directorio `backend/`.
"""

import argparse
import os
import re
import sys
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MIGRATIONS_DIR = os.path.dirname(os.path.abspath(__file__))
MASTER_TENANT_ID = "00000000-0000-0000-0000-000000000001"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", ""}


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def load_sql(filename):
    """Lee un .sql y le quita el BEGIN/COMMIT propio.

    La transacción la maneja este runner, que es lo que permite el --dry-run:
    aplicar todo y revertir sin dejar rastro.
    """
    path = os.path.join(MIGRATIONS_DIR, filename)
    with open(path, "r", encoding="utf-8") as fh:
        sql = fh.read()
    sql = re.sub(r"^\s*BEGIN\s*;", "", sql, count=1, flags=re.IGNORECASE | re.MULTILINE)
    sql = re.sub(r"^\s*COMMIT\s*;", "", sql, count=1, flags=re.IGNORECASE | re.MULTILINE)
    return sql


def describe_target(db_url):
    parsed = urlparse(db_url)
    host = parsed.hostname or ""
    return host, parsed.path.lstrip("/"), host.lower() in LOCAL_HOSTS


def drain_notices(conn, prefix="   "):
    for notice in conn.notices:
        print(prefix + notice.strip().replace("NOTICE:  ", ""))
    del conn.notices[:]


def confirm_remote(host, dbname):
    print()
    print("  " + "!" * 68)
    print(f"  El destino NO es local: {host} / {dbname}")
    print("  Si es la base de producción de Hidroponía, hacé un backup ANTES:")
    print(f"     pg_dump -h {host} -d {dbname} -Fc -f backup_pre_multitenant.dump")
    print("  " + "!" * 68)
    answer = input("\n  Escribí APLICAR EN PRODUCCION para continuar: ").strip()
    return answer == "APLICAR EN PRODUCCION"


# --------------------------------------------------------------------------
# Acciones
# --------------------------------------------------------------------------

def run_sql_file(db_url, filename, commit, label):
    sql = load_sql(filename)
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        drain_notices(conn)

        if commit:
            conn.commit()
            print(f"\n  OK: {label} aplicada y confirmada (COMMIT).")
        else:
            conn.rollback()
            print(f"\n  OK: {label} se aplicó sin errores y se revirtió (ROLLBACK).")
            print("      La base quedó exactamente como estaba.")
        return True
    except Exception as exc:
        conn.rollback()
        drain_notices(conn)
        print(f"\n  FALLO: {label} abortada. Se revirtió todo.\n")
        print(f"  {type(exc).__name__}: {exc}")
        return False
    finally:
        conn.close()


def set_app_role_password(db_url):
    """Asigna la contraseña del rol de aplicación desde el entorno.

    Se hace acá y no en el .sql para no versionar secretos.
    """
    password = os.environ.get("APP_DB_PASSWORD")
    if not password:
        print("\n  AVISO: APP_DB_PASSWORD no está definida.")
        print("  El rol `controlcenter_app` quedó creado pero SIN contraseña, así que")
        print("  todavía no puede conectarse. Para terminar de activar el aislamiento:")
        print("     1) export APP_DB_PASSWORD='...'   (o agregarla al .env)")
        print("     2) volver a correr este script con --set-role-password")
        print("     3) apuntar DATABASE_URL a controlcenter_app en vez de postgres")
        return False

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app'")
            if not cur.fetchone():
                print("  El rol controlcenter_app no existe todavía. Corré --apply primero.")
                return False
            cur.execute("ALTER ROLE controlcenter_app WITH PASSWORD %s", (password,))
        print("  OK: contraseña asignada al rol controlcenter_app.")
        return True
    finally:
        conn.close()


def verify(db_url):
    """Prueba empírica de que el aislamiento funciona.

    No alcanza con que las políticas existan: hay que demostrar que un tenant
    no ve los datos del otro Y que el rol de la aplicación no las evade.
    """
    print("\n  Verificación de aislamiento multi-tenant")
    print("  " + "-" * 68)

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    failures = []
    try:
        with conn.cursor() as cur:
            # --- Contexto de conexión -------------------------------------
            cur.execute("SELECT current_user, "
                        "(SELECT rolsuper FROM pg_roles WHERE rolname = current_user), "
                        "(SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)")
            user, is_super, bypass = cur.fetchone()
            print(f"  Conectado como .............. {user}")

            if is_super or bypass:
                print(f"  Superusuario / BYPASSRLS .... SI   <-- RLS NO SE APLICA")
                failures.append(
                    f"La app conecta como '{user}', que evade RLS por completo. "
                    "El aislamiento no es real hasta apuntar DATABASE_URL al rol "
                    "controlcenter_app."
                )
            else:
                print(f"  Superusuario / BYPASSRLS .... no   (RLS activo)")

            # --- Cobertura de tenant_id -----------------------------------
            cur.execute("""
                SELECT c.relname
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'
                  AND c.relname NOT IN ('tenants')
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                        AND NOT a.attisdropped)
                ORDER BY 1
            """)
            missing = [r[0] for r in cur.fetchall()]
            if missing:
                print(f"  Tablas sin tenant_id ........ {', '.join(missing)}")
                failures.append(f"Tablas sin discriminador de tenant: {', '.join(missing)}")
            else:
                print("  Tablas sin tenant_id ........ ninguna")

            # --- Cobertura de RLS -----------------------------------------
            cur.execute("""
                SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
                                   AND NOT a.attisdropped
                WHERE n.nspname = 'public' AND c.relkind = 'r'
                ORDER BY 1
            """)
            rows = cur.fetchall()
            unprotected = [r[0] for r in rows if not (r[1] and r[2] and r[3] > 0)]
            print(f"  Tablas con tenant_id ........ {len(rows)}")
            if unprotected:
                print(f"  Sin RLS+FORCE+política ...... {', '.join(unprotected)}")
                failures.append(f"Tablas con tenant_id pero sin RLS efectivo: {', '.join(unprotected)}")
            else:
                print("  Sin RLS+FORCE+política ...... ninguna")

            # --- Prueba funcional de segregación --------------------------
            cur.execute("SET app.current_tenant = %s", (MASTER_TENANT_ID,))
            cur.execute("SELECT count(*) FROM products_cache")
            as_master = cur.fetchone()[0]

            ghost = "00000000-0000-0000-0000-0000000000ff"
            cur.execute("SET app.current_tenant = %s", (ghost,))
            cur.execute("SELECT count(*) FROM products_cache")
            as_ghost = cur.fetchone()[0]

            cur.execute("RESET app.current_tenant")

            print(f"  products_cache (maestro) .... {as_master}")
            print(f"  products_cache (otro tenant)  {as_ghost}")

            if is_super or bypass:
                print("  Segregación ................. no evaluable (el rol evade RLS)")
            elif as_ghost == 0 and as_master > 0:
                print("  Segregación ................. CORRECTA")
            elif as_master == 0:
                print("  Segregación ................. sin datos para evaluar")
            else:
                failures.append(
                    f"FUGA DE DATOS: otro tenant ve {as_ghost} productos del maestro.")
    finally:
        conn.close()

    print("  " + "-" * 68)
    if failures:
        print("\n  PENDIENTES:\n")
        for i, f in enumerate(failures, 1):
            print(f"   {i}. {f}")
        return False
    print("\n  Aislamiento verificado end-to-end.")
    return True


# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Migración multi-tenant de ControlCenter",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true",
                       help="Aplica todo en una transacción y hace ROLLBACK")
    group.add_argument("--apply", action="store_true", help="Aplica y confirma la migración")
    group.add_argument("--rollback", action="store_true", help="Revierte la migración")
    group.add_argument("--verify", action="store_true", help="Audita el aislamiento")
    group.add_argument("--set-role-password", action="store_true",
                       help="Asigna APP_DB_PASSWORD al rol controlcenter_app")
    parser.add_argument("--skip-init-db", action="store_true",
                        help="No ejecutar database.init_db() antes de migrar")
    args = parser.parse_args()

    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: falta DATABASE_URL (backend/.env)")
        return 1

    host, dbname, is_local = describe_target(db_url)
    print()
    print("=" * 72)
    print("  ControlCenter — Migración Multi-Tenant (001)")
    print("=" * 72)
    print(f"  Destino: {host or 'socket local'} / {dbname}   [{'LOCAL' if is_local else 'REMOTO'}]")

    if args.verify:
        return 0 if verify(db_url) else 1

    if args.set_role_password:
        return 0 if set_app_role_password(db_url) else 1

    if args.rollback:
        if not is_local and not confirm_remote(host, dbname):
            print("\n  Cancelado.")
            return 1
        print("\n  Revirtiendo migración...\n")
        ok = run_sql_file(db_url, "001_multitenancy_rollback.sql", True, "Reversión")
        return 0 if ok else 1

    # --- dry-run / apply --------------------------------------------------
    if args.apply and not is_local and not confirm_remote(host, dbname):
        print("\n  Cancelado.")
        return 1

    if not args.skip_init_db:
        # init_db() es idempotente y crea las tablas que todavía no existan,
        # para que la migración no se saltee ninguna por drift de esquema.
        print("\n  Ejecutando database.init_db() (idempotente)...")
        try:
            from src import database
            database.init_db()
            print("  OK: esquema base al día.")
        except Exception as exc:
            print(f"  FALLO en init_db(): {exc}")
            return 1

    mode = "APLICANDO" if args.apply else "ENSAYO (se revierte al final)"
    print(f"\n  {mode}\n")
    ok = run_sql_file(db_url, "001_multitenancy.sql", args.apply, "Migración 001")
    if not ok:
        return 1

    if args.apply:
        print()
        set_app_role_password(db_url)
        print()
        verify(db_url)

    return 0


if __name__ == "__main__":
    sys.exit(main())
