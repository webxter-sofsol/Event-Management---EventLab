"""
Audit log middleware — catch-all fallback that records mutating HTTP requests
(POST, PUT, PATCH, DELETE) to the AuditLog model.

This supplements the explicit log_action() calls in individual views and
ensures that any mutation not covered by a view-level call is still recorded.
"""

import logging

logger = logging.getLogger(__name__)

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class AuditLogMiddleware:
    """
    Django middleware that writes an AuditLog entry for every mutating request
    made by an authenticated user.

    Runs *after* the view so the response status code is available.
    Only logs requests that completed successfully (2xx responses).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if request.method in MUTATING_METHODS:
            self._log(request, response)

        return response

    def _log(self, request, response):
        try:
            # Only log authenticated users
            user = getattr(request, "user", None)
            if user is None or not user.is_authenticated:
                return

            # Only log successful mutations (2xx)
            if not (200 <= response.status_code < 300):
                return

            from apps.events.models import log_action

            log_action(
                admin=user,
                action="http_mutation",
                detail={
                    "method": request.method,
                    "path": request.path,
                    "status_code": response.status_code,
                },
                event=None,
            )
        except Exception:
            # Never let audit logging break the response
            logger.exception("AuditLogMiddleware failed to write log entry")
