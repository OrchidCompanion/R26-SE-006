from datetime import datetime, timedelta

DATE_FORMAT_DISPLAY = "%d %b %Y"  # e.g., "19 Aug 2026"
DATE_FORMAT_ISO = "%Y-%m-%d"

def get_current_date() -> datetime:
    """Return current date object."""
    return datetime.now()

def get_current_date_str() -> str:
    """Format current date as 'DD Month YYYY'."""
    return get_current_date().strftime(DATE_FORMAT_DISPLAY)

def add_days_to_date(start_date: datetime, days: float) -> datetime:
    """Add float/int days to a datetime object."""
    return start_date + timedelta(days=days)

def format_date_display(dt: datetime) -> str:
    """Format datetime object to string."""
    return dt.strftime(DATE_FORMAT_DISPLAY)

def get_date_features(dt: datetime = None) -> tuple:
    """Return (month, day_of_year) for a given date."""
    if dt is None:
        dt = get_current_date()
    return dt.month, dt.timetuple().tm_yday
