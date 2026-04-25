from django.conf import settings
from django.utils import timezone

from apps.auth_service.models import LoginAttempt


def _window_start():
    lockout_minutes = getattr(settings, "LOGIN_LOCKOUT_MINUTES", 15)
    return timezone.now() - timezone.timedelta(minutes=lockout_minutes)


def is_account_locked(email: str) -> bool:
    """Return True if the account has 5+ failed attempts in the lockout window."""
    max_attempts = getattr(settings, "LOGIN_MAX_ATTEMPTS", 5)
    failed_count = LoginAttempt.objects.filter(
        email=email,
        success=False,
        attempted_at__gte=_window_start(),
    ).count()
    return failed_count >= max_attempts


def get_retry_after(email: str) -> int:
    """Return seconds until the oldest qualifying failed attempt falls outside the window."""
    max_attempts = getattr(settings, "LOGIN_MAX_ATTEMPTS", 5)
    lockout_minutes = getattr(settings, "LOGIN_LOCKOUT_MINUTES", 15)

    oldest = (
        LoginAttempt.objects.filter(
            email=email,
            success=False,
            attempted_at__gte=_window_start(),
        )
        .order_by("attempted_at")
        .values_list("attempted_at", flat=True)
        .first()
    )
    if oldest is None:
        return 0

    unlock_at = oldest + timezone.timedelta(minutes=lockout_minutes)
    remaining = (unlock_at - timezone.now()).total_seconds()
    return max(0, int(remaining))


def record_attempt(email: str, success: bool, ip_address: str = None) -> None:
    """Persist a LoginAttempt record."""
    LoginAttempt.objects.create(email=email, success=success, ip_address=ip_address)
