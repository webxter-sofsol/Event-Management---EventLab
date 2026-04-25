from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .models import Alert


class AlertListView(APIView):
    """GET /api/alerts/ — list unread alerts for the current admin's events"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        alerts = Alert.objects.filter(
            event__created_by=request.user,
            is_read=False,
        ).select_related("event").order_by("-created_at")[:50]

        data = [
            {
                "id": str(a.id),
                "event_id": str(a.event.id),
                "event_name": a.event.name,
                "message": a.message,
                "created_at": a.created_at.isoformat(),
                "is_read": a.is_read,
            }
            for a in alerts
        ]
        return Response({"count": len(data), "alerts": data})


class AlertDismissView(APIView):
    """PATCH /api/alerts/{id}/dismiss/ — mark a single alert as read"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            alert = Alert.objects.get(pk=pk, event__created_by=request.user)
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        alert.is_read = True
        alert.save(update_fields=["is_read"])
        return Response({"id": str(alert.id), "is_read": True})


class AlertDismissAllView(APIView):
    """PATCH /api/alerts/dismiss-all/ — mark all alerts as read"""
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        updated = Alert.objects.filter(
            event__created_by=request.user,
            is_read=False,
        ).update(is_read=True)
        return Response({"dismissed": updated})
