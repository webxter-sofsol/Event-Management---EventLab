import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event

from .models import AIInsight
from .service import (
    compute_registration_velocity,
    get_dashboard_insights,
    get_event_suggestions,
    get_weekly_summary,
)

logger = logging.getLogger(__name__)


class AISuggestionsView(APIView):
    """GET /api/events/{id}/ai/suggestions/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            event = Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        content = get_event_suggestions(event)
        if content.get("available") is False:
            return Response(content, status=503)

        insight = AIInsight.objects.create(
            event=event,
            insight_type="date_suggestion",
            content=content,
            is_limited_data=content.get("is_limited_data", False),
        )
        return Response({
            "id": str(insight.id),
            "available": True,
            "is_limited_data": insight.is_limited_data,
            "suggested_date": content.get("suggested_date"),
            "suggested_capacity": content.get("suggested_capacity"),
            "reasoning": content.get("reasoning"),
            "generated_at": insight.generated_at.isoformat(),
        })


class AIVelocityAlertView(APIView):
    """GET /api/events/{id}/ai/velocity-alert/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            event = Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        velocity_data = compute_registration_velocity(event)
        if velocity_data.get("alert"):
            insight = AIInsight.objects.create(
                event=event,
                insight_type="velocity_alert",
                content=velocity_data,
                is_limited_data=velocity_data.get("is_limited_data", False),
            )
            velocity_data["insight_id"] = str(insight.id)
        return Response(velocity_data)


class AIWeeklySummaryView(APIView):
    """GET /api/ai/weekly-summary/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        content = get_weekly_summary()
        insight = AIInsight.objects.create(
            event=None,
            insight_type="weekly_summary",
            content=content,
            is_limited_data=False,
        )
        return Response({
            "id": str(insight.id),
            "insight_type": insight.insight_type,
            "content": insight.content,
            "generated_at": insight.generated_at.isoformat(),
        })


class AIDashboardInsightsView(APIView):
    """GET /api/ai/dashboard-insights/ — holistic AI briefing for the admin"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        result = get_dashboard_insights(request.user)
        return Response(result)
