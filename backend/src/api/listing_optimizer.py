"""Optimizador de publicaciones de Mercado Libre.

Principio de diseño de todo el módulo: las herramientas operan siempre sobre
una selección explícita de publicaciones, nunca sobre "el catálogo". Probar
con una sola publicación es mandar una lista de un elemento; no hay un modo de
prueba que después se comporte distinto.

El unico endpoint que escribe en Mercado Libre es /apply, y tiene dry_run en
True por defecto: para modificar de verdad hay que pedirlo explicitamente.
/audit, /suggest y la edicion de borradores no tocan nada en ML.
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
import json

from src import database
from src.utils import (listing_audit_service, listing_ai_service,
                       listing_apply_service, listing_image_service)

router = APIRouter()

# Tope por request para que una selección enorme no monopolice el worker.
MAX_IDS_POR_LLAMADA = 200


class AuditRequest(BaseModel):
    ml_ids: list[str] = Field(..., min_length=1)
    force_refresh: bool = False
    # 'local' calcula los objetivos a partir de /items y /categories.
    # 'performance' usa el dato oficial de Mercado Libre, que hoy devuelve 403
    # para esta cuenta; queda expuesto para probar si lo habilitan.
    strategy: str = 'local'


@router.post("/audit")
def audit_listings(payload: AuditRequest):
    """Audita la calidad de las publicaciones seleccionadas. Solo lectura."""
    if not payload.ml_ids:
        raise HTTPException(status_code=400, detail="No se seleccionaron publicaciones para auditar")

    if len(payload.ml_ids) > MAX_IDS_POR_LLAMADA:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {MAX_IDS_POR_LLAMADA} publicaciones por auditoría. "
                   f"Se recibieron {len(payload.ml_ids)}."
        )

    if payload.strategy not in ('local', 'performance'):
        raise HTTPException(
            status_code=400,
            detail="strategy debe ser 'local' o 'performance'")

    resultados = listing_audit_service.audit_listings(
        payload.ml_ids,
        force_refresh=payload.force_refresh,
        strategy=payload.strategy)

    return {
        "success": True,
        "strategy": payload.strategy,
        "total": len(resultados),
        "auditadas": sum(1 for r in resultados if r['status'] == 'ok'),
        "en_cache": sum(1 for r in resultados if r['status'] == 'cached'),
        "con_error": sum(1 for r in resultados if r['status'] == 'error'),
        "resultados": resultados,
    }


@router.get("/health")
def get_health(ml_ids: Optional[str] = Query(None, description="IDs separados por coma")):
    """Devuelve el diagnóstico cacheado. Sin ml_ids, todo lo auditado."""
    ids = [i.strip() for i in ml_ids.split(',') if i.strip()] if ml_ids else None
    filas = database.get_listing_health(ids)

    for fila in filas:
        # goals_json se guarda crudo; se entrega parseado para que el frontend
        # no tenga que saber que en la base es texto.
        try:
            fila['goals'] = json.loads(fila.pop('goals_json') or '[]')
        except (ValueError, TypeError):
            fila['goals'] = []
        if fila.get('fetched_at'):
            fila['fetched_at'] = str(fila['fetched_at'])

    return {"total": len(filas), "items": filas}


# =============================================================================
# SUGERENCIAS — generacion y edicion de borradores. No escriben en Mercado Libre.
# =============================================================================

class SuggestRequest(BaseModel):
    ml_ids: list[str] = Field(..., min_length=1)
    # Sin targets se generan los objetivos que la auditoria marco pendientes.
    targets: Optional[list[str]] = None


class SuggestionEditRequest(BaseModel):
    proposed_value: str


@router.post("/suggest")
def suggest(payload: SuggestRequest):
    """Genera borradores de mejora para la seleccion. No modifica nada en ML."""
    if len(payload.ml_ids) > MAX_IDS_POR_LLAMADA:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {MAX_IDS_POR_LLAMADA} publicaciones por vez")

    if payload.targets:
        invalidos = [t for t in payload.targets if t not in listing_ai_service.CAMPOS_VALIDOS]
        if invalidos:
            raise HTTPException(
                status_code=400,
                detail=f"Campos no soportados: {', '.join(invalidos)}")

    resultados = listing_ai_service.generate_suggestions(payload.ml_ids, payload.targets)
    generadas = sum(
        1 for r in resultados for s in r.get('sugerencias', [])
        if s.get('status') == 'draft')

    return {"success": True, "total": len(resultados),
            "borradores": generadas, "resultados": resultados}


@router.get("/suggestions")
def list_suggestions(ml_ids: Optional[str] = Query(None, description="IDs separados por coma"),
                     status: Optional[str] = Query(None, description="Estados separados por coma")):
    ids = [i.strip() for i in ml_ids.split(',') if i.strip()] if ml_ids else None
    estados = [e.strip() for e in status.split(',') if e.strip()] if status else None
    filas = database.get_listing_suggestions(ml_ids=ids, statuses=estados)
    for fila in filas:
        for campo in ('created_at', 'applied_at'):
            if fila.get(campo):
                fila[campo] = str(fila[campo])
    return {"total": len(filas), "items": filas}


@router.put("/suggestions/{suggestion_id}")
def edit_suggestion(suggestion_id: int, payload: SuggestionEditRequest):
    """Edicion manual de un borrador antes de aplicarlo."""
    existentes = database.get_listing_suggestions(suggestion_ids=[suggestion_id])
    if not existentes:
        raise HTTPException(status_code=404, detail="El borrador no existe")

    sugerencia = existentes[0]
    valor = payload.proposed_value
    if sugerencia['field'] == 'attributes':
        try:
            valor_validable = json.loads(valor or '{}')
        except ValueError:
            raise HTTPException(status_code=400, detail="Los atributos deben ser un JSON válido")
    else:
        valor_validable = valor

    # Se valida al editar para avisar en el momento, pero se guarda igual: la
    # validacion definitiva corre al aplicar.
    _saneado, es_valido, motivo = listing_ai_service.validate_listing_change(
        sugerencia['field'], valor_validable)

    database.update_listing_suggestion(
        suggestion_id, proposed_value=valor,
        status='edited' if es_valido else 'failed',
        reject_reason=None if es_valido else motivo)

    return {"success": True, "valido": es_valido, "motivo": motivo}


@router.delete("/suggestions/{suggestion_id}")
def discard_suggestion(suggestion_id: int):
    if not database.delete_listing_suggestion(suggestion_id):
        raise HTTPException(status_code=404, detail="El borrador no existe")
    return {"success": True}


# =============================================================================
# APLICACION — los unicos endpoints que escriben en Mercado Libre
# =============================================================================

class ApplyRequest(BaseModel):
    suggestion_ids: list[int] = Field(..., min_length=1)
    # Por defecto simula: devuelve el diff y no toca nada. Para modificar de
    # verdad hay que mandar dry_run=false explicitamente.
    dry_run: bool = True


class RollbackRequest(BaseModel):
    revision_ids: list[int] = Field(..., min_length=1)


@router.post("/apply")
def apply(payload: ApplyRequest):
    """Aplica borradores. Con dry_run (el default) solo devuelve el diff."""
    if len(payload.suggestion_ids) > MAX_IDS_POR_LLAMADA:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {MAX_IDS_POR_LLAMADA} cambios por vez")

    resultados = listing_apply_service.apply_suggestions(
        payload.suggestion_ids, dry_run=payload.dry_run)

    return {
        "success": True,
        "dry_run": payload.dry_run,
        "total": len(resultados),
        "aplicados": sum(1 for r in resultados if r['status'] == 'applied'),
        "simulados": sum(1 for r in resultados if r['status'] == 'dry_run'),
        "rechazados": sum(1 for r in resultados if r['status'] == 'rejected'),
        "con_error": sum(1 for r in resultados if r['status'] == 'error'),
        "resultados": resultados,
    }


@router.get("/revisions")
def list_revisions(ml_ids: Optional[str] = Query(None, description="IDs separados por coma"),
                   only_active: bool = Query(False, description="Excluir los ya revertidos")):
    ids = [i.strip() for i in ml_ids.split(',') if i.strip()] if ml_ids else None
    filas = database.get_listing_revisions(ml_ids=ids, only_active=only_active)
    for fila in filas:
        for campo in ('applied_at', 'reverted_at'):
            if fila.get(campo):
                fila[campo] = str(fila[campo])
    return {"total": len(filas), "items": filas}


@router.post("/rollback")
def rollback(payload: RollbackRequest):
    """Restaura en Mercado Libre el valor anterior de los cambios indicados."""
    resultados = listing_apply_service.rollback_revisions(payload.revision_ids)
    return {
        "success": True,
        "total": len(resultados),
        "revertidos": sum(1 for r in resultados if r['status'] == 'reverted'),
        "con_error": sum(1 for r in resultados if r['status'] == 'error'),
        "resultados": resultados,
    }


# =============================================================================
# CONFIGURACION DE IA — que proveedor usar, gratuito o pago
# =============================================================================

class AiConfigRequest(BaseModel):
    provider: str
    anthropic_model: Optional[str] = None
    anthropic_api_key: Optional[str] = None


@router.get("/ai-config")
def get_ai_config():
    """Proveedor activo, cuales estan configurados y los modelos pagos elegibles."""
    return listing_ai_service.get_ai_config()


@router.put("/ai-config")
def set_ai_config(payload: AiConfigRequest):
    if payload.provider not in listing_ai_service.PROVEEDORES:
        raise HTTPException(
            status_code=400,
            detail="Proveedor no soportado: " + payload.provider)

    if payload.anthropic_model:
        validos = [m['id'] for m in listing_ai_service.MODELOS_ANTHROPIC]
        if payload.anthropic_model not in validos:
            raise HTTPException(
                status_code=400,
                detail="Modelo no soportado. Validos: " + ", ".join(validos))
        database.set_setting('anthropic_model', payload.anthropic_model)

    # La clave solo se escribe si vino con contenido: la interfaz nunca la
    # devuelve, asi que un campo vacio significa "no la cambies".
    if payload.anthropic_api_key and payload.anthropic_api_key.strip():
        database.set_setting('anthropic_api_key', payload.anthropic_api_key.strip())

    database.set_setting('ai_provider', payload.provider)
    return {"success": True, **listing_ai_service.get_ai_config()}


# =============================================================================
# IMAGENES — variantes derivadas de la foto real, para revisar antes de subir
# =============================================================================

class ImageSuggestRequest(BaseModel):
    ml_ids: list[str] = Field(..., min_length=1)
    estilos: Optional[list[str]] = None


class ImageConfigRequest(BaseModel):
    provider: Optional[str] = None
    image_model: Optional[str] = None
    openai_api_key: Optional[str] = None


@router.get("/image-config")
def get_image_config():
    return listing_image_service.get_image_config()


@router.put("/image-config")
def set_image_config(payload: ImageConfigRequest):
    if payload.provider:
        if payload.provider not in listing_image_service.PROVEEDORES_IMAGEN:
            raise HTTPException(status_code=400,
                                detail="Proveedor de imagenes no soportado")
        database.set_setting('image_provider', payload.provider)

    if payload.image_model:
        validos = [m['id'] for m in listing_image_service.MODELOS_IMAGEN]
        if payload.image_model not in validos:
            raise HTTPException(status_code=400,
                                detail="Modelo no soportado. Validos: " + ", ".join(validos))
        database.set_setting('image_model', payload.image_model)

    # La clave solo se escribe si vino con contenido: la interfaz nunca la
    # devuelve, asi que un campo vacio significa "no la cambies".
    if payload.openai_api_key and payload.openai_api_key.strip():
        database.set_setting('openai_api_key', payload.openai_api_key.strip())

    return {"success": True, **listing_image_service.get_image_config()}


@router.post("/suggest-images")
def suggest_images(payload: ImageSuggestRequest):
    """Genera variantes a partir de la foto real. No sube nada a Mercado Libre."""
    if len(payload.ml_ids) > 20:
        raise HTTPException(
            status_code=400,
            detail="Maximo 20 publicaciones por vez: generar imagenes es costoso")

    resultados = []
    for ml_id in payload.ml_ids:
        item, error = listing_apply_service._leer_item(ml_id)
        if error:
            resultados.append({"ml_id": ml_id, "ok": False, "error": error})
            continue

        salida = listing_image_service.generate_variants(ml_id, item, payload.estilos)
        if not salida.get('ok'):
            resultados.append({"ml_id": ml_id, "ok": False, "error": salida.get('error')})
            continue

        # Regenerar reemplaza la propuesta anterior, igual que en los textos.
        database.delete_pending_suggestions(ml_id, 'pictures')

        rutas = [{"ruta": g['ruta'], "url": g['url'], "estilo": g['estilo']}
                 for g in salida['generadas']]
        suggestion_id = database.save_listing_suggestion(
            ml_id=ml_id, field='pictures', goal_code='FOTOS',
            current_value=json.dumps(
                [p.get('secure_url') for p in (item.get('pictures') or [])],
                ensure_ascii=False),
            proposed_value=json.dumps(rutas, ensure_ascii=False),
            status='draft', model_used=salida.get('modelo'))

        resultados.append({
            "ml_id": ml_id, "ok": True, "suggestion_id": suggestion_id,
            "generadas": rutas, "errores": salida.get('errores') or [],
            "origen": salida.get('origen'),
        })

    return {
        "success": True,
        "total": len(resultados),
        "con_imagenes": sum(1 for r in resultados if r.get('ok')),
        "resultados": resultados,
    }


# =============================================================================
# RESOLVER CALIDAD EN LOTE — genera para varias publicaciones a la vez
# =============================================================================

class ResolveBulkRequest(BaseModel):
    ml_ids: list[str] = Field(..., min_length=1)
    # Las imagenes se cobran por unidad, asi que no van salvo que se pidan.
    incluir_imagenes: bool = False


@router.post("/resolve-bulk")
def resolve_bulk(payload: ResolveBulkRequest, background_tasks: BackgroundTasks):
    """Arranca la generacion en segundo plano y vuelve enseguida.

    Generar para veinte publicaciones son decenas de llamadas al modelo: hacerlo
    dentro de la peticion la cortaria por timeout.
    """
    if len(payload.ml_ids) > MAX_IDS_POR_LLAMADA:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {MAX_IDS_POR_LLAMADA} publicaciones por vez")

    estado = listing_ai_service.get_bulk_progress()
    if estado.get('status') == 'running':
        raise HTTPException(
            status_code=409,
            detail=f"Ya hay una generación en curso ({estado.get('current')} de "
                   f"{estado.get('total')}). Esperá a que termine.")

    background_tasks.add_task(
        listing_ai_service.generate_suggestions_bulk,
        payload.ml_ids, payload.incluir_imagenes)

    return {"success": True, "total": len(payload.ml_ids),
            "message": "Generación iniciada en segundo plano"}


@router.get("/resolve-progress")
def resolve_progress():
    return listing_ai_service.get_bulk_progress()
