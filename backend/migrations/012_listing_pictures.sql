-- Migration 012: imágenes generadas como un tipo de mejora más
--
-- El optimizador ya proponía título, ficha técnica y descripción. Las imágenes
-- derivadas de la foto real del producto son otra propuesta revisable, así que
-- viajan por el mismo circuito: borrador -> simulación -> aplicación -> rollback.
--
-- Idempotente y reversible (ver 012_listing_pictures_rollback.sql).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. 'pictures' pasa a ser un campo válido de sugerencia
-- ---------------------------------------------------------------------
ALTER TABLE listing_suggestions
    DROP CONSTRAINT IF EXISTS listing_suggestions_field_check;

ALTER TABLE listing_suggestions
    ADD CONSTRAINT listing_suggestions_field_check
    CHECK (field IN ('title', 'attributes', 'description', 'pictures'));

COMMENT ON COLUMN listing_suggestions.proposed_value IS
    'Texto para title y description; JSON para attributes; y para pictures, un '
    'JSON con las rutas locales de las imágenes generadas, que recién se suben '
    'a Mercado Libre al aplicar.';

-- ---------------------------------------------------------------------
-- 2. De dónde salió cada imagen, para poder auditarlo después
-- ---------------------------------------------------------------------
ALTER TABLE listing_suggestions
    ADD COLUMN IF NOT EXISTS source_note TEXT;

COMMENT ON COLUMN listing_suggestions.source_note IS
    'Para imágenes: proveedor, modelo y foto de origen usada como base. Una '
    'imagen publicada tiene que poder rastrearse hasta la foto real de la que '
    'se derivó.';

COMMIT;
