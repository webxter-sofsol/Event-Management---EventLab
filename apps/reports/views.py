import csv

from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event
from apps.tickets.models import Ticket


def _get_event_or_404(pk):
    try:
        return Event.objects.get(pk=pk)
    except Event.DoesNotExist:
        return None


class EventReportView(APIView):
    """GET /api/events/{id}/report/ — JSON report for an event."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        event = _get_event_or_404(pk)
        if event is None:
            return Response({"detail": "Not found."}, status=404)

        confirmed_tickets = Ticket.objects.filter(
            event=event, status="confirmed"
        ).select_related("guest")

        total_registrations = confirmed_tickets.count()
        available_seats = event.available_seats
        revenue = total_registrations * event.price

        guest_list = [
            {"name": t.guest.name, "email": t.guest.email, "registered_at": t.registered_at}
            for t in confirmed_tickets
        ]

        return Response(
            {
                "event_id": str(event.id),
                "event_name": event.name,
                "total_registrations": total_registrations,
                "available_seats": available_seats,
                "revenue": float(revenue),
                "guests": guest_list,
            }
        )


class EventReportExportView(APIView):
    """GET /api/events/{id}/report/export/?format=csv — CSV download."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        event = _get_event_or_404(pk)
        if event is None:
            return Response({"detail": "Not found."}, status=404)

        confirmed_tickets = Ticket.objects.filter(
            event=event, status="confirmed"
        ).select_related("guest")

        total_registrations = confirmed_tickets.count()
        revenue = total_registrations * event.price

        def generate_rows():
            # Summary header rows
            yield ["Event Name", event.name]
            yield ["Total Registrations", total_registrations]
            yield ["Available Seats", event.available_seats]
            yield ["Revenue", float(revenue)]
            yield []  # blank separator
            # Guest list header
            yield ["Guest Name", "Guest Email", "Registered At"]
            for ticket in confirmed_tickets:
                yield [
                    ticket.guest.name,
                    ticket.guest.email,
                    ticket.registered_at.isoformat(),
                ]

        class EchoBuffer:
            """Minimal write-only buffer for StreamingHttpResponse."""
            def write(self, value):
                return value

        pseudo_buffer = EchoBuffer()
        writer = csv.writer(pseudo_buffer)

        response = StreamingHttpResponse(
            (writer.writerow(row) for row in generate_rows()),
            content_type="text/csv",
        )
        safe_name = event.name.replace('"', "")
        response["Content-Disposition"] = f'attachment; filename="{safe_name}_report.csv"'
        return response
