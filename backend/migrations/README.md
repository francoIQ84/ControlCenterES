# Migración Multi-Tenant — procedimiento de producción

La base de producción tiene operación diaria activa. Este procedimiento está
pensado para aplicarse sin cortar el servicio y con marcha atrás disponible en
cada paso.

## Estado actual del diseño

El aislamiento entre inquilinos lo hace **PostgreSQL**, no el código de la
aplicación. `database.get_connection()` declara el tenant activo con
`SET app.current_tenant`, y las políticas RLS filtran todas las consultas
existentes sin que haya que modificarlas.

Mientras dure la transición el sistema está en **fail-open**: si algo no
propaga contexto, cae al Tenant Maestro (Hidroponía Rosario) y se comporta
exactamente como antes de la migración.

---

## 1. Respaldo (obligatorio)

```bash
pg_dump -h <host> -d controlcenter -Fc -f backup_pre_multitenant.dump
```

## 2. Ensayo general

Aplica la migración completa dentro de una transacción y la revierte. No deja
rastro; sirve para detectar cualquier incompatibilidad del esquema real.

```bash
cd backend && python -m migrations.run_migration --dry-run
```

## 3. Aplicar

```bash
cd backend && python -m migrations.run_migration --apply
```

Pide escribir `APLICAR EN PRODUCCION` cuando el destino no es local. Al
terminar ejecuta la auditoría automáticamente.

En este punto **todavía no hay aislamiento real**: la aplicación sigue
conectada como `postgres`, que es superusuario y evade RLS. Es intencional —
permite verificar que la operación no se rompió antes de cambiar nada más.

## 4. Activar el aislamiento

El paso que convierte las políticas en algo efectivo.

```bash
# 4.a Contraseña del rol de aplicación (no versionarla)
export APP_DB_PASSWORD='<contraseña generada>'
python -m migrations.run_migration --set-role-password

# 4.b Apuntar la aplicación a ese rol
#     DATABASE_URL=postgresql://controlcenter_app:<contraseña>@host:5432/controlcenter

# 4.c Reiniciar el servicio y comprobar
python -m migrations.run_migration --verify
```

`--verify` debe reportar **cero pendientes**. Mientras diga
`Superusuario / BYPASSRLS .... SI`, el aislamiento sigue siendo decorativo.

> Al conectar como `controlcenter_app`, `init_db()` deja de crear tablas: ese
> rol no tiene privilegios DDL a propósito (si fuera dueño de las tablas podría
> saltarse sus propias políticas). El esquema pasa a gestionarse desde acá.

## 5. Clave de cifrado de credenciales

```bash
python -m src.utils.crypto --generate-key
# export CREDENTIALS_ENCRYPTION_KEY=...
```

Sin ella, la API de integraciones responde 503 en vez de guardar secretos en
claro. **Si se pierde, las credenciales cifradas de todos los inquilinos son
irrecuperables.** No la guardes en `backend/.env`: ese archivo está versionado
en git.

## 6. Cerrar el fail-open

Solo cuando todo lo que corre fuera de una petición HTTP propague contexto de
tenant (el scheduler ya lo hace):

```sql
ALTER DATABASE controlcenter RESET app.default_tenant;
```

A partir de ahí, cualquier consulta sin tenant explícito no ve ni escribe nada,
en lugar de caer al Tenant Maestro. Es una sola sentencia y no requiere tocar
código. Para volver atrás:

```sql
ALTER DATABASE controlcenter SET app.default_tenant = '00000000-0000-0000-0000-000000000001';
```

---

## Verificación

```bash
# Tests unitarios: no necesitan base de datos, corren en menos de un segundo
python -m unittest discover -s tests/unit -t .
```

```bash
# Auditoría del esquema y prueba de fuga
python -m migrations.run_migration --verify
APP_DB_PASSWORD=... python -m migrations.test_isolation
```

```bash
# Recorrido completo por la API real: alta de inquilino, aislamiento,
# cifrado, webhooks, planes y gating de plataforma
APP_DB_PASSWORD=... python -m tests.test_multitenancy
```

Las pruebas de integración crean un inquilino descartable y lo eliminan al
terminar. Los tests unitarios no tocan nada.

## Marcha atrás

```bash
python -m migrations.run_migration --rollback
```

Devuelve el esquema al estado mono-tenant conservando los datos. **Aborta si
hay más de un tenant cargado**, porque en ese caso quitar `tenant_id`
mezclaría irreversiblemente los datos de clientes distintos: ahí la vuelta
atrás es restaurar el dump del paso 1.
