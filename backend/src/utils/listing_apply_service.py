"""Aplicación de mejoras a publicaciones de Mercado Libre.

Es el único módulo del optimizador que ESCRIBE. Por eso:

  * `dry_run` viene en True por defecto en toda la cadena. Para modificar de
    verdad hay que pedirlo explícitamente.
  * El valor anterior se lee de Mercado Libre en el momento de aplicar, nunca
    del cache: un rollback con datos desactualizados sería peor que el problema
    que vino a resolver.
  * Cada cambio se revalida justo antes de mandarlo, porque entre que se generó
    el borrador y que alguien apretó Aplicar, una persona pudo editarlo.
  * Un fallo en una publicación no interrumpe las demás. La respuesta es
    siempre por publicación: qué se aplicó, qué falló y por qué. Nada de un
    "éxito" global que esconda tres errores.
"""
import json

from src import database, meli_api
from src.utils.listing_ai_service import validate_listing_change

# La descripción se actualiza por un recurso aparte del resto del ítem.
RUTA_DESCRIPCION = "/items/{ml_id}/description"
RUTA_ITEM = "/items/{ml_id}"


def _leer_item(ml_id: str):
    try:
        r = meli_api.api_request("GET", RUTA_ITEM.format(ml_id=ml_id))
    except ConnectionError as e:
        return None, str(e)
    if r is None:
        return None, "Sin respuesta de Mercado Libre"
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}: {' '.join((r.text or '')[:160].split())}"
    try:
        return r.json(), None
    except ValueError:
        return None, "La respuesta de Mercado Libre no es JSON válido"


def read_current_value(ml_id: str, field: str, item=None):
    """Valor vigente EN MERCADO LIBRE del campo. Devuelve (valor, error)."""
    if field == 'description':
        try:
            r = meli_api.api_request("GET", RUTA_DESCRIPCION.format(ml_id=ml_id))
        except ConnectionError as e:
            return None, str(e)
        if r is None:
            return None, "Sin respuesta de Mercado Libre"
        if r.status_code == 404:
            return "", None  # la publicación todavía no tiene descripción
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}: {' '.join((r.text or '')[:160].split())}"
        try:
            cuerpo = r.json()
        except ValueError:
            return None, "La respuesta de Mercado Libre no es JSON válido"
        return str(cuerpo.get('plain_text') or cuerpo.get('text') or ''), None

    if item is None:
        item, error = _leer_item(ml_id)
        if error:
            return None, error

    if field == 'title':
        return str(item.get('title') or ''), None

    if field == 'attributes':
        actuales = {
            a.get('id'): a.get('value_name')
            for a in (item.get('attributes') or [])
            if isinstance(a, dict) and a.get('id')
        }
        return json.dumps(actuales, ensure_ascii=False), None

    return None, f"Campo no soportado: {field}"


def _escribir(ml_id: str, field: str, valor):
    """Manda el cambio a Mercado Libre. Devuelve (ok, error)."""
    if field == 'description':
        try:
            r = meli_api.api_request(
                "PUT", RUTA_DESCRIPCION.format(ml_id=ml_id),
                json_data={"plain_text": valor})
        except ConnectionError as e:
            return False, str(e)
    else:
        if field == 'title':
            cuerpo = {"title": valor}
        else:
            cuerpo = {"attributes": [
                {"id": attr_id, "value_name": str(v)} for attr_id, v in valor.items()
            ]}
        try:
            r = meli_api.api_request("PUT", RUTA_ITEM.format(ml_id=ml_id), json_data=cuerpo)
        except ConnectionError as e:
            return False, str(e)

    if r is None:
        return False, "Sin respuesta de Mercado Libre"
    if r.status_code not in (200, 201):
        return False, f"HTTP {r.status_code}: {' '.join((r.text or '')[:220].split())}"
    return True, None


def _sincronizar_cache_local(ml_id: str, field: str, valor):
    """Deja el cache local igual a lo que quedo en Mercado Libre.

    Sin esto la auditoria vuelve a leer la descripcion vieja de products_cache
    y sigue marcando el objetivo como pendiente aunque el cambio ya este
    aplicado. El titulo y los atributos se leen de /items en vivo, pero la
    descripcion sale del cache porque /items no la devuelve.
    """
    try:
        if field == 'description':
            database.update_product_description_meli(ml_id, valor)
        elif field == 'title':
            database.update_product_title(ml_id, valor)
    except Exception:
        # El cambio ya esta aplicado en Mercado Libre. Que no se haya podido
        # refrescar el cache se corrige en la proxima sincronizacion: no
        # convierte un cambio exitoso en un error.
        pass


def _valor_propuesto(sugerencia):
    """El valor guardado como texto vuelve a su forma nativa según el campo."""
    crudo = sugerencia.get('proposed_value')
    if sugerencia.get('field') == 'attributes':
        try:
            datos = json.loads(crudo or '{}')
        except ValueError:
            return None, "El borrador de atributos no es un JSON válido"
        if not isinstance(datos, dict):
            return None, "El borrador de atributos no es un objeto"
        return datos, None
    return crudo, None


def apply_suggestions(suggestion_ids, dry_run: bool = True) -> list:
    """Aplica los borradores indicados. Un resultado por borrador.

    Con dry_run (el default) devuelve el diff y no toca nada.
    """
    ids = [int(i) for i in (suggestion_ids or [])]
    if not ids:
        return []

    sugerencias = database.get_listing_suggestions(suggestion_ids=ids)
    por_id = {s['id']: s for s in sugerencias}

    cache_items = {}
    cache_catalogos = {}
    resultados = []

    for suggestion_id in ids:
        sugerencia = por_id.get(suggestion_id)
        if not sugerencia:
            resultados.append({"suggestion_id": suggestion_id, "status": "error",
                               "error": "El borrador ya no existe"})
            continue

        ml_id = sugerencia['ml_id']
        field = sugerencia['field']
        base = {"suggestion_id": suggestion_id, "ml_id": ml_id, "field": field}

        if sugerencia['status'] == 'applied':
            resultados.append(dict(base, status="skipped",
                                   error="Ya estaba aplicado"))
            continue

        valor, error = _valor_propuesto(sugerencia)
        if error:
            resultados.append(dict(base, status="error", error=error))
            continue

        # El catálogo hace falta para validar atributos contra la categoría.
        catalogo = []
        if field == 'attributes':
            if ml_id not in cache_items:
                item, error_item = _leer_item(ml_id)
                cache_items[ml_id] = (item, error_item)
            item, error_item = cache_items[ml_id]
            if error_item:
                resultados.append(dict(base, status="error", error=error_item))
                continue
            categoria = item.get('category_id')
            if categoria:
                if categoria not in cache_catalogos:
                    try:
                        rc = meli_api.api_request("GET", f"/categories/{categoria}/attributes")
                        cache_catalogos[categoria] = rc.json() if (rc is not None and rc.status_code == 200) else []
                    except Exception:
                        cache_catalogos[categoria] = []
                catalogo = cache_catalogos[categoria]

        # Revalidación: entre que se genero el borrador y ahora, alguien pudo editarlo.
        valor, es_valido, motivo = validate_listing_change(field, valor, catalogo)
        if not es_valido:
            database.update_listing_suggestion(
                suggestion_id, status='failed', reject_reason=motivo)
            resultados.append(dict(base, status="rejected", error=motivo))
            continue

        item_cacheado = cache_items.get(ml_id, (None, None))[0]
        anterior, error = read_current_value(ml_id, field, item=item_cacheado)
        if error:
            resultados.append(dict(base, status="error", error=error))
            continue

        if dry_run:
            resultados.append(dict(
                base, status="dry_run", previous_value=anterior,
                proposed_value=valor if field != 'attributes' else json.dumps(valor, ensure_ascii=False)))
            continue

        ok, error = _escribir(ml_id, field, valor)
        if not ok:
            database.update_listing_suggestion(
                suggestion_id, status='failed', reject_reason=error)
            resultados.append(dict(base, status="error", error=error))
            continue

        _sincronizar_cache_local(ml_id, field, valor)

        aplicado = valor if field != 'attributes' else json.dumps(valor, ensure_ascii=False)
        revision_id = database.save_listing_revision(
            ml_id, field, anterior or '', aplicado, suggestion_id)
        database.update_listing_suggestion(
            suggestion_id, status='applied', mark_applied=True)

        resultados.append(dict(base, status="applied", revision_id=revision_id,
                               previous_value=anterior))

    return resultados


def rollback_revisions(revision_ids) -> list:
    """Restaura en Mercado Libre el valor anterior de los cambios indicados."""
    ids = [int(i) for i in (revision_ids or [])]
    if not ids:
        return []

    revisiones = database.get_listing_revisions(revision_ids=ids)
    por_id = {r['id']: r for r in revisiones}
    resultados = []

    for revision_id in ids:
        revision = por_id.get(revision_id)
        if not revision:
            resultados.append({"revision_id": revision_id, "status": "error",
                               "error": "La revisión no existe"})
            continue

        base = {"revision_id": revision_id, "ml_id": revision['ml_id'],
                "field": revision['field']}

        if revision.get('reverted_at'):
            resultados.append(dict(base, status="skipped", error="Ya estaba revertido"))
            continue

        valor = revision['previous_value']
        if revision['field'] == 'attributes':
            try:
                valor = json.loads(valor or '{}')
            except ValueError:
                resultados.append(dict(base, status="error",
                                       error="El valor anterior no es un JSON válido"))
                continue
            # Un atributo que antes estaba vacío se restaura como cadena vacía,
            # que es como Mercado Libre representa "sin valor".
            valor = {k: (v if v is not None else '') for k, v in valor.items()}

        ok, error = _escribir(revision['ml_id'], revision['field'], valor)
        if not ok:
            resultados.append(dict(base, status="error", error=error))
            continue

        _sincronizar_cache_local(revision['ml_id'], revision['field'], valor)
        database.mark_revision_reverted(revision_id)
        resultados.append(dict(base, status="reverted"))

    return resultados
