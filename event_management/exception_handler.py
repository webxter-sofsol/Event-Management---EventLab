"""
Custom DRF exception handler.
Returns structured error responses without leaking stack traces.
"""

import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        # Normalise validation errors to {"errors": {...}}
        if response.status_code == 400 and isinstance(response.data, dict):
            if "detail" not in response.data:
                response.data = {"errors": response.data}
        return response

    # Unhandled exception — return generic 500 without stack trace
    logger.exception("Unhandled exception in view %s", context.get("view"))
    return Response(
        {"detail": "An internal error occurred"},
        status=500,
    )
