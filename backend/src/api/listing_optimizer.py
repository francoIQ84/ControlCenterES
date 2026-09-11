"""Optimizador de publicaciones de Mercado Libre.

Principio de diseño de todo el módulo: las herramientas operan siempre sobre
una selección explícita de publicaciones, nunca sobre "el catálogo". Probar
con una sola publicación es mandar una lista de un elemento; no hay un modo de
prueba que después se comporte distinto.

Por ahora solo auditoría, que es de lectura. Los endpoints que escriben en
Mercado Libre llegan en una etapa posterior y van a tener dry-run por defecto.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
import json

from src import database
from src.utils import listing_audit_service

router = APIRouter()

# Tope por request para que una selección enorme no monopolice el worker.
MAX_IDS_POR_LLAMADA = 200


class AuditRequest(BaseModel):
    ml_ids: list[str] = Field(..., min_length=1)
    force_refresh: bool = False


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

    resultados = listing_audit_service.audit_listings(
        payload.ml_ids, force_refresh=payload.force_refresh)

    return {
        "success": True,
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
