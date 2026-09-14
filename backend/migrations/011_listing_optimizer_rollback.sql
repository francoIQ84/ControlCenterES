-- =====================================================================
-- 011_listing_optimizer_rollback.sql — revierte 011_listing_optimizer.sql
-- =====================================================================
--
-- Elimina las tres tablas del optimizador de publicaciones.
--
-- BORRA DATOS: los diagnósticos, los borradores pendientes y el historial de
-- revisiones se pierden. Lo que NO se toca es Mercado Libre: los cambios que
-- ya se hayan aplicado a las publicaciones siguen aplicados, y sin
-- listing_revisions se pierde la posibilidad de revertirlos desde el panel.
--
-- Antes de correr esto en producción, verificar que no queden cambios
-- aplicados sin revertir que se quieran deshacer:
--
--   SELECT ml_id, field, applied_at
--   FROM listing_revisions
--   WHERE reverted_at IS NULL;
--
-- Ninguna otra tabla referencia a estas, así que el orden solo respeta la FK
-- interna entre revisions y suggestions.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS listing_revisions;
DROP TABLE IF EXISTS listing_suggestions;
DROP TABLE IF EXISTS listing_health;

COMMIT;
