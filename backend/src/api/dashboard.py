from fastapi import APIRouter, Depends, Request, Header
from typing import Optional, List
from pydantic import BaseModel
from src import database
from src.api.auth import get_current_user

router = APIRouter()

def get_optional_user(request: Request, authorization: str = Header(None)):
    try:
        final_token = None
        if authorization and authorization.startswith("Bearer "):
            final_token = authorization.split(" ")[1]
        else:
            final_token = request.query_params.get("token")
        if final_token:
            return database.get_user_by_token(final_token)
    except Exception:
        pass
    return None

class NotificationIdsPayload(BaseModel):
    notification_ids: Optional[List[str]] = None

@router.get("/metrics")
def get_metrics(period: str = "total", start_date: Optional[str] = None, end_date: Optional[str] = None):
    stats = database.get_dashboard_metrics(period=period, start_date_str=start_date, end_date_str=end_date)
    return stats

@router.get("/notifications")
def get_notifications(opt_user: Optional[dict] = Depends(get_optional_user)):
    user_id = opt_user['id'] if opt_user else None
    return database.get_system_notifications(user_id=user_id)

@router.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    database.mark_notification_as_read(current_user['id'], notification_id)
    return {"status": "ok", "notification_id": notification_id}

@router.post("/notifications/{notification_id}/dismiss")
def dismiss_single_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    database.dismiss_notification(current_user['id'], notification_id)
    return {"status": "ok", "notification_id": notification_id}

@router.post("/notifications/mark-all-read")
def mark_all_read(payload: Optional[NotificationIdsPayload] = None, current_user: dict = Depends(get_current_user)):
    ids = payload.notification_ids if payload and payload.notification_ids else None
    database.mark_all_notifications_as_read(current_user['id'], ids)
    return {"status": "ok"}

@router.post("/notifications/clear-all")
def clear_all(payload: Optional[NotificationIdsPayload] = None, current_user: dict = Depends(get_current_user)):
    ids = payload.notification_ids if payload and payload.notification_ids else None
    database.clear_all_notifications(current_user['id'], ids)
    return {"status": "ok"}


