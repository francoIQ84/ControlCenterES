from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional

ARGENTINA_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

def get_now_ar() -> datetime:
    """Returns the current timezone-aware datetime in America/Argentina/Buenos_Aires."""
    return datetime.now(ARGENTINA_TZ)

def get_now_ar_iso() -> str:
    """Returns the current datetime as an ISO-8601 string with Argentina offset (e.g. '2026-09-18T14:05:00-03:00')."""
    return datetime.now(ARGENTINA_TZ).isoformat()

def to_ar_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    """Converts any datetime to America/Argentina/Buenos_Aires."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Assume it's already in Argentina time or attach it
        return dt.replace(tzinfo=ARGENTINA_TZ)
    return dt.astimezone(ARGENTINA_TZ)

def format_ar_timestamp(ts: float, fmt: str = "%Y%m%d_%H%M%S") -> str:
    """Formats a unix timestamp (seconds since epoch) in Argentina timezone."""
    dt = datetime.fromtimestamp(ts, tz=ARGENTINA_TZ)
    return dt.strftime(fmt)
