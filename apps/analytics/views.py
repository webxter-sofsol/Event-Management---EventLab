from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event
from apps.tickets.models import Ticket

PERIOD_DELTAS = {
    "week": timedelta(weeks=1),
    "month": timedelta(days=30),
    "year": timedelta(days=365),
}


class AnalyticsSummaryView(APIView):
    """GET /api/analytics/summary/?period=week|month|year"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = request.query_params.get("period", "month")
        delta = PERIOD_DELTAS.get(period)

        if delta is None:
            return Response(
                {"detail": "Invalid period. Use 'week', 'month', or 'year'."},
                status=400,
            )

        since = timezone.now() - delta

        events_qs = Event.objects.filter(created_at__gte=since)
        total_events = events_qs.count()

        # Confirmed tickets for events created in the period
        tickets_qs = Ticket.objects.filter(
            status="confirmed", event__created_at__gte=since
        ).select_related("event")

        total_registrations = tickets_qs.count()

        # Average attendance rate: mean of (confirmed / capacity) across events in period
        event_stats = events_qs.annotate(
            confirmed=Count("ticket_set", filter=Q(ticket_set__status="confirmed"))
        )
        rates = [
            ev.confirmed / ev.capacity
            for ev in event_stats
            if ev.capacity > 0
        ]
        avg_attendance_rate = round(sum(rates) / len(rates), 4) if rates else 0.0

        # Revenue: sum of price per confirmed ticket
        revenue = sum(t.event.price for t in tickets_qs)

        return Response(
            {
                "period": period,
                "since": since.isoformat(),
                "total_events": total_events,
                "total_registrations": total_registrations,
                "avg_attendance_rate": avg_attendance_rate,
                "revenue": str(revenue),
            }
        )
