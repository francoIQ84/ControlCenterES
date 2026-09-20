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

El runner aplica **001 y 016** en una sola transacción: o queda todo el
aislamiento o no queda nada. Las migraciones 002–015 son de funcionalidad y se
siguen aplicando con `psql`, como hasta ahora.

En este punto **todavía no hay aislamiento real**: la aplicación sigue
conectada como `postgres`, que es superusuario y evade RLS. Es intencional —
permite verificar que la operación no se rompió antes de cambiar nada más.

## 4. Activar el aislamiento

El paso que convierte las políticas en algo efectivo. **Mientras no se haga,
todo lo anterior es decorativo**: PostgreSQL ignora las políticas RLS por
completo cuando quien consulta es superusuario.

```bash
# 4.a Contraseña del rol de aplicación (no versionarla)
export APP_DB_PASSWORD='<contraseña generada>'
python -m migrations.run_migration --set-role-password

# 4.b Apuntar la aplicación a ese rol, y dejar la de superusuario
#     únicamente para mantenimiento:
#
#     DATABASE_URL=postgresql://controlcenter_app:<contraseña>@host:5432/controlcenter
#     ADMIN_DATABASE_URL=postgresql://postgres:<contraseña>@host:5432/controlcenter

# 4.c Reiniciar el servicio y comprobar
python -m migrations.run_migration --verify
```

`--verify` debe reportar **cero pendientes**. Mientras diga
`Superusuario / BYPASSRLS .... SI`, el aislamiento sigue siendo decorativo.

`ADMIN_DATABASE_URL` es la conexión que usan `--apply`, `--rollback` y
`--set-role-password`, porque el rol de la aplicación no tiene privilegios
DDL a propósito. `--verify` en cambio usa siempre `DATABASE_URL`: lo que se
quiere comprobar es justamente qué ve el rol con el que corre la aplicación.
Si `ADMIN_DATABASE_URL` no está definida, ambas caen a `DATABASE_URL`.

---

## Migración 016 — Cerrar los agujeros de aislamiento

La 001 dejó 23 tablas aisladas, pero los módulos incorporados después trajeron
tablas que nacieron sin `tenant_id` o con la columna puesta y la política
olvidada. La 016 las cierra:

| Tabla | Qué le faltaba | Qué se filtraba |
|---|---|---|
| `diffusion_groups` / `_group_members` / `_campaigns` | política RLS | teléfonos y correos de los clientes de cada negocio |
| `meli_questions` | `tenant_id` y política | preguntas de Mercado Libre, con nickname e id de comprador |
| `service_payments` | `tenant_id` y política | vencimientos de servicios; además el alta mensual contaba filas de todos |
| `meli_optimizations` | `tenant_id` y política | auditorías de publicaciones |
| `two_factor_codes` | `tenant_id` y política | (fallaba cerrado, pero quedaba fuera del aislamiento) |
| `unlinked_mp_matches` | política, `DEFAULT`, `NOT NULL` | desvinculaciones de pagos |
| `listing_*`, `quotes`, `integration_sync_*` | `FORCE ROW LEVEL SECURITY` | nada hoy; el dueño de la tabla evadía sus políticas |

Además agrega `tenants.custom_domain` (dominio propio por negocio),
`tenant_settings.plan_limits` (topes del plan) y siembra
`tenant_integrations.external_account_id` desde `settings`, que es lo que
permite que un webhook entrante sepa de qué negocio es.

No corta servicio: todo lo preexistente queda asignado al Tenant Maestro, igual
que hizo la 001.

Marcha atrás individual:

```bash
psql -d controlcenter -f backend/migrations/016_tenant_isolation_gaps_rollback.sql
```

Conserva las columnas y los datos —quitarlos mezclaría irreversiblemente los de
clientes distintos— y revierte únicamente el filtrado.

### Tablas globales por diseño

`--verify` ya no las reporta como agujeros. Son tres y cada una tiene su
`COMMENT ON TABLE` explicando por qué:

- `tenants`: el resolver lo lee **antes** de saber quién es el inquilino.
- `tenant_subscription_payments`: cobros de la plataforma a sus clientes, no
  datos del cliente. La administración los consulta de todos los negocios.
- `meli_category_attrs_cache`: atributos públicos de las categorías de Mercado
  Libre, idénticos para todos.

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

## Migración 015 — Registro de sincronización por inquilino

Crea `integration_sync_state` (la marca de agua vigente de cada canal) e
`integration_sync_log` (el historial de corridas). Es lo que permite que una
sincronización arranque desde donde quedó la anterior en lugar de adivinar la
ventana, que era de donde salían los huecos de ventas después de un rato sin
servicio.

```bash
psql -d controlcenter -f backend/migrations/015_integration_sync_log.sql
```

No hace falta ventana de mantenimiento: son dos tablas nuevas, nada de lo
existente se modifica. Mientras no esté aplicada, la aplicación sigue
sincronizando igual —`src/sync_state.py` cae a un modo inerte— solo que sin
dejar registro ni poder retomar.

La semilla usa `tenant_integrations.last_sync_at` como punto de partida de las
cuentas ya vinculadas. Los canales sin ese dato arrancan con la ventana por
defecto de 7 días.

Marcha atrás (no se pierde nada operativo: el registro es metadato):

```bash
psql -d controlcenter -f backend/migrations/015_integration_sync_log_rollback.sql
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
