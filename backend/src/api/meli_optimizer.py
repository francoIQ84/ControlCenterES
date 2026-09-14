"""
Endpoints REST del Optimizador de Publicaciones de Mercado Libre con IA.

Provee auditoría, optimización con Gemini AI y aplicación de cambios.
"""

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
import traceback

router = APIRouter(prefix="/meli-optimizer", tags=["meli-optimizer"])


class OptimizeRequest(BaseModel):
    """Body para personalizar la optimización."""
    force: bool = False


class ApplyRequest(BaseModel):
    """Body para aplicar optimizaciones con datos custom."""
    optimized_title: Optional[str] = None
    optimized_description: Optional[str] = None
    suggested_attributes: Optional[list] = None


# ───────────────────────────────────────────────────────────────────────
# Auditoría
# ───────────────────────────────────────────────────────────────────────

@router.get("/audit")
def audit_all():
    """Ejecuta auditoría masiva de todas las publicaciones ML del tenant."""
    from src.utils.meli_optimizer_service import audit_all_items
    try:
        result = audit_all_items()
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit/{ml_id}")
def audit_single(ml_id: str):
    """Audita una publicación individual contra los requerimientos de su categoría."""
    from src.utils.meli_optimizer_service import audit_single_item
    try:
        result = audit_single_item(ml_id)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audits/cached")
def get_cached_audits():
    """Retorna las últimas auditorías cacheadas (sin re-ejecutar)."""
    from src import database
    try:
        results = database.get_latest_meli_audits()
        scores = [r.get("score", 0) for r in results]
        avg = round(sum(scores) / len(scores)) if scores else 0
        return {
            "success": True,
            "total": len(results),
            "avg_score": avg,
            "results": results,
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────────────────────────────────────────────
# Optimización con IA
# ───────────────────────────────────────────────────────────────────────

@router.post("/optimize/{ml_id}")
def optimize_single(ml_id: str):
    """Genera optimizaciones con Gemini AI para una publicación."""
    from src.utils.meli_optimizer_service import optimize_with_ai
    try:
        result = optimize_with_ai(ml_id)
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize-all")
def optimize_all():
    """Optimiza todas las publicaciones con score bajo en batch."""
    from src.utils.meli_optimizer_service import optimize_all_items
    try:
        result = optimize_all_items()
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────────────────────────────────────────────
# Aplicación de optimizaciones
# ───────────────────────────────────────────────────────────────────────

@router.post("/apply/{ml_id}")
def apply_single(ml_id: str, body: ApplyRequest = None):
    """Aplica las optimizaciones aprobadas a una publicación en ML.
    
    Opcionalmente puede recibir los campos a aplicar en el body
    para permitir edición manual antes de aplicar.
    """
    from src.utils.meli_optimizer_service import apply_optimization
    try:
        optimization = None
        if body and (body.optimized_title or body.optimized_description or body.suggested_attributes):
            optimization = {
                "optimized_title": body.optimized_title,
                "optimized_description": body.optimized_description,
                "suggested_attributes": body.suggested_attributes or [],
            }
        result = apply_optimization(ml_id, optimization=optimization)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/apply-all")
def apply_all():
    """Aplica todas las optimizaciones pendientes de forma masiva."""
    from src.utils.meli_optimizer_service import apply_all_optimizations
    try:
        result = apply_all_optimizations()
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────────────────────────────────────────────
# Historial
# ───────────────────────────────────────────────────────────────────────

@router.get("/history")
def get_history(limit: int = 50):
    """Retorna el historial de optimizaciones realizadas."""
    from src.utils.meli_optimizer_service import get_optimization_history
    try:
        return {"history": get_optimization_history(limit)}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
