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

#: Migraciones de aislamiento, en orden. Son las que este runner administra:
#: la 001 levanta los cimientos y la 016 cierra las tablas que quedaron
#: afuera. El resto (002-015) son de funcionalidad y se aplican con psql
#: según el README; no se incluyen acá para que `--apply` sobre producción
#: siga siendo una operación acotada y predecible.
ISOLATION_MIGRATIONS = (
    ("001_multitenancy.sql", "Migración 001 (cimientos multi-tenant)"),
    ("016_tenant_isolation_gaps.sql", "Migración 016 (tablas sin aislar)"),
)

ISOLATION_ROLLBACKS = (
    ("016_tenant_isolation_gaps_rollback.sql", "Reversión 016"),
    ("001_multitenancy_rollback.sql", "Reversión 001"),
)

#: Tablas que no llevan `tenant_id` a propósito. Sin esta lista la auditoría
#: las reporta como agujeros para siempre y el ruido termina tapando un
#: agujero de verdad. Cada una está justificada con COMMENT ON TABLE en la
#: migración 016.
GLOBAL_BY_DESIGN = (
    "tenants",                        # registro de ruteo: se lee antes de saber el tenant
    "tenant_subscription_payments",   # cobros de la plataforma, no del inquilino
    "meli_category_attrs_cache",      # metadatos públicos de Mercado Libre
)


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

def run_sql_files(db_url, migrations, commit):
    """Aplica una secuencia de .sql dentro de UNA sola transacción.

    Que sea una sola importa por dos motivos. En `--dry-run`, la 016 necesita
    `app_current_tenant()`, que crea la 001: si cada archivo tuviera su propia
    transacción, el ROLLBACK de la primera dejaría a la segunda sin función a
    la cual agarrarse. Y en `--apply`, media migración aplicada es peor que
    ninguna: o queda todo el aislamiento o no queda nada.
    """
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    label = ""
    try:
        for filename, label in migrations:
            print(f"  -> {label}")
            with conn.cursor() as cur:
                cur.execute(load_sql(filename))
            drain_notices(conn, prefix="      ")

        if commit:
            conn.commit()
            print(f"\n  OK: {len(migrations)} migración/es aplicadas y confirmadas (COMMIT).")
        else:
            conn.rollback()
            print(f"\n  OK: {len(migrations)} migración/es se aplicaron sin errores "
                  f"y se revirtieron (ROLLBACK).")
            print("      La base quedó exactamente como estaba.")
        return True
    except Exception as exc:
        conn.rollback()
        drain_notices(conn, prefix="      ")
        print(f"\n  FALLO en '{label}'. Se revirtió TODA la secuencia.\n")
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
                  AND c.relname <> ALL(%s)
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                        AND NOT a.attisdropped)
                ORDER BY 1
            """, (list(GLOBAL_BY_DESIGN),))
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
                  AND c.relname <> ALL(%s)
                ORDER BY 1
            """, (list(GLOBAL_BY_DESIGN),))
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
    app_url = os.environ.get("DATABASE_URL")
    if not app_url:
        print("ERROR: falta DATABASE_URL (backend/.env)")
        return 1

    # Hay dos conexiones distintas y no son intercambiables.
    #
    # DATABASE_URL es la de la aplicación: rol sin privilegios, sujeto a RLS.
    # Con ella no se puede migrar (no tiene DDL) pero es la ÚNICA con la que
    # tiene sentido auditar, porque lo que se quiere comprobar es justamente
    # que ese rol no ve lo que no debe.
    #
    # ADMIN_DATABASE_URL es la de mantenimiento (superusuario). Es la que crea
    # tablas, políticas y roles. Si no está definida se cae a DATABASE_URL, que
    # es el caso de una instalación vieja donde la app todavía conecta como
    # postgres.
    admin_url = os.environ.get("ADMIN_DATABASE_URL") or app_url
    ddl_url = app_url if args.verify else admin_url

    host, dbname, is_local = describe_target(ddl_url)
    print()
    print("=" * 72)
    print("  ControlCenter — Migración Multi-Tenant (001 + 016)")
    print("=" * 72)
    print(f"  Destino: {host or 'socket local'} / {dbname}   [{'LOCAL' if is_local else 'REMOTO'}]")
    if admin_url != app_url and not args.verify:
        print("  Conexión: ADMIN_DATABASE_URL (mantenimiento)")

    if args.verify:
        return 0 if verify(app_url) else 1

    db_url = ddl_url

    if args.set_role_password:
        return 0 if set_app_role_password(db_url) else 1

    if args.rollback:
        if not is_local and not confirm_remote(host, dbname):
            print("\n  Cancelado.")
            return 1
        print("\n  Revirtiendo migraciones (en orden inverso)...\n")
        return 0 if run_sql_files(db_url, ISOLATION_ROLLBACKS, True) else 1

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
            # `database` fija su URL al importarse, apuntando al rol de la
            # aplicación. Ese rol no tiene DDL a propósito, así que init_db()
            # se saltearía el bootstrap y una instalación nueva quedaría sin
            # tablas. Acá se lo apunta a la conexión de mantenimiento, que es
            # la que corresponde para crear esquema.
            previous_url = database.DB_URL
            database.DB_URL = db_url
            try:
                database.init_db()
            finally:
                database.DB_URL = previous_url
            print("  OK: esquema base al día.")
        except Exception as exc:
            print(f"  FALLO en init_db(): {exc}")
            return 1

    mode = "APLICANDO" if args.apply else "ENSAYO (se revierte al final)"
    print(f"\n  {mode}\n")
    if not run_sql_files(db_url, ISOLATION_MIGRATIONS, args.apply):
        return 1

    if args.apply:
        print()
        set_app_role_password(db_url)
        print()
        verify(db_url)

    return 0


if __name__ == "__main__":
    sys.exit(main())
