-- Rollback de 012_listing_pictures.sql
--
-- Descarta las sugerencias de imágenes antes de restaurar el CHECK original:
-- si quedara alguna fila con field='pictures', la restricción no podría
-- volver a crearse.

BEGIN;

DELETE FROM listing_suggestions WHERE field = 'pictures';

ALTER TABLE listing_suggestions
    DROP CONSTRAINT IF EXISTS listing_suggestions_field_check;

ALTER TABLE listing_suggestions
    ADD CONSTRAINT listing_suggestions_field_check
    CHECK (field IN ('title', 'attributes', 'description'));

ALTER TABLE listing_suggestions DROP COLUMN IF EXISTS source_note;

COMMIT;
