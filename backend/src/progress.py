import threading

_lock = threading.Lock()
_state = {
    "status": "idle",  # "idle", "syncing_products", "syncing_sales", "completed", "failed"
    "progress": 0,
    "message": "",
    "current": 0,
    "total": 0
}

def update_progress(status=None, progress=None, message=None, current=None, total=None):
    with _lock:
        if status is not None:
            _state["status"] = status
        if progress is not None:
            _state["progress"] = progress
        if message is not None:
            _state["message"] = message
        if current is not None:
            _state["current"] = current
        if total is not None:
            _state["total"] = total

def get_progress():
    with _lock:
        return dict(_state)
