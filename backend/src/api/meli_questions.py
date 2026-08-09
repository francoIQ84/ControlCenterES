from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from pydantic import BaseModel, Field

from src import database, meli_api
from src.api.auth import get_current_user
from src.utils.meli_questions_service import process_question, process_pending_questions, generate_ai_answer, sanitize_and_validate_answer

router = APIRouter(prefix="/api/meli/questions", tags=["Mercado Libre Questions"])


class AnswerQuestionPayload(BaseModel):
    answer_text: str = Field(..., description="Texto de la respuesta a publicar en Mercado Libre")


class TestGeneratePayload(BaseModel):
    question_text: str
    item_id: Optional[str] = "MLA1001"
    buyer_nickname: Optional[str] = "COMPRADOR_DEMO"


class SettingsPayload(BaseModel):
    enabled: bool = True
    mode: str = "auto" # "auto" | "draft"
    prompt_custom: Optional[str] = ""


@router.get("/")
def list_questions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    _: dict = Depends(get_current_user)
):
    """Retorna la lista de preguntas registradas en el sistema con paginación y filtros."""
    questions = database.get_meli_questions(limit=limit, offset=offset, status=status, search=search)
    total = database.get_meli_questions_count(status=status, search=search)
    stats = database.get_meli_questions_stats()

    return {
        "questions": questions,
        "total": total,
        "limit": limit,
        "offset": offset,
        "stats": stats
    }


@router.get("/stats")
def get_stats(_: dict = Depends(get_current_user)):
    """Retorna las estadísticas acumuladas de preguntas e IA."""
    return database.get_meli_questions_stats()


@router.get("/settings")
def get_settings(_: dict = Depends(get_current_user)):
    """Obtiene la configuración actual del auto-responder de preguntas de MeLi."""
    enabled = database.get_setting("meli_auto_responder_enabled", "1") == "1"
    mode = database.get_setting("meli_auto_responder_mode", "auto")
    prompt = database.get_setting("meli_auto_responder_prompt", "")

    return {
        "enabled": enabled,
        "mode": mode,
        "prompt_custom": prompt
    }


@router.put("/settings")
def update_settings(payload: SettingsPayload, _: dict = Depends(get_current_user)):
    """Actualiza la configuración del auto-responder de preguntas de MeLi."""
    database.set_setting("meli_auto_responder_enabled", "1" if payload.enabled else "0")
    database.set_setting("meli_auto_responder_mode", payload.mode)
    database.set_setting("meli_auto_responder_prompt", payload.prompt_custom or "")

    return {
        "message": "Configuración actualizada con éxito",
        "settings": {
            "enabled": payload.enabled,
            "mode": payload.mode,
            "prompt_custom": payload.prompt_custom or ""
        }
    }


@router.post("/{question_id}/answer")
def answer_question(
    question_id: str,
    payload: AnswerQuestionPayload,
    _: dict = Depends(get_current_user)
):
    """Publica manualmente la respuesta a una pregunta o aprueba un borrador generado por la IA."""
    clean_answer, is_valid, err_reason = sanitize_and_validate_answer(payload.answer_text)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Respuesta inválida: {err_reason}")

    ok, msg = meli_api.post_question_answer(question_id, clean_answer)
    if not ok:
        database.update_meli_question_answer(
            question_id=question_id,
            answer_text=clean_answer,
            status="ERROR",
            error_message=msg
        )
        raise HTTPException(status_code=500, detail=f"Error al enviar a Mercado Libre: {msg}")

    database.update_meli_question_answer(
        question_id=question_id,
        answer_text=clean_answer,
        status="ANSWERED_MANUAL",
        ai_model_used="manual_override"
    )

    return {"message": "Respuesta enviada con éxito a Mercado Libre", "question_id": question_id}


@router.post("/test-generate")
def test_generate(payload: TestGeneratePayload, _: dict = Depends(get_current_user)):
    """Prueba la generación de respuestas de Gemini AI en tiempo real sin publicar en MeLi."""
    item = None
    if payload.item_id:
        try:
            item = database.get_product_by_ml_id(payload.item_id)
        except Exception:
            pass

    if not item:
        item = {
            "ml_id": payload.item_id or "MLA1001",
            "title": "Producto de Prueba Demo",
            "price": 25000.0,
            "available_quantity": 10,
            "status": "active"
        }

    prompt_custom = database.get_setting("meli_auto_responder_prompt", "")
    raw_answer, ai_model = generate_ai_answer(
        question_text=payload.question_text,
        item_data=item,
        buyer_nickname=payload.buyer_nickname or "COMPRADOR_DEMO",
        custom_prompt=prompt_custom
    )

    clean_answer, is_valid, err_reason = sanitize_and_validate_answer(raw_answer)

    return {
        "generated_answer": clean_answer,
        "raw_answer": raw_answer,
        "is_valid": is_valid,
        "validation_error": err_reason if not is_valid else None,
        "ai_model_used": ai_model,
        "product_used": item
    }


@router.post("/sync")
def sync_unanswered(background_tasks: BackgroundTasks, _: dict = Depends(get_current_user)):
    """Dispara inmediatamente la sincronización y respuesta automática de preguntas pendientes."""
    background_tasks.add_task(process_pending_questions)
    return {"message": "Sincronización de preguntas iniciada en segundo plano"}


@router.post("/webhook")
async def meli_webhook(request: Request):
    """
    Webhook receptor para notificaciones de Mercado Libre (topic: questions).
    """
    try:
        body = await request.json()
        topic = body.get("topic")
        resource = body.get("resource") # e.g. "/questions/12345678"

        if topic == "questions" and resource and resource.startswith("/questions/"):
            q_id = resource.split("/")[-1]
            q_detail = meli_api.get_question_detail(q_id)
            if q_detail and q_detail.get("status") == "UNANSWERED":
                process_question(q_detail)
        return {"status": "OK"}
    except Exception as e:
        print(f"[Meli Webhook Questions Error] {e}")
        return {"status": "ERROR", "detail": str(e)}
