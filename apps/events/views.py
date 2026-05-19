import base64
import io
import logging

import qrcode
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auth_service.permissions import IsAdmin

from .models import Event, log_action
from .serializers import EventSerializer

logger = logging.getLogger(__name__)


def expire_events():
    """Mark any active events whose end_date has passed as cancelled. Call before any read/write."""
    now = timezone.now()
    Event.objects.filter(
        status='active',
        end_date__isnull=False,
        end_date__lte=now,
    ).update(status='cancelled')


def _dispatch_cancellation_emails(event):
    """Send cancellation notification emails to all confirmed ticket holders."""
    from apps.tickets.models import Ticket

    tickets = Ticket.objects.filter(event=event, status="confirmed").select_related("guest")
    for ticket in tickets:
        try:
            send_mail(
                subject=f"Event Cancelled: {event.name}",
                message=(
                    f"We regret to inform you that '{event.name}' scheduled for "
                    f"{event.date.strftime('%Y-%m-%d %H:%M')} UTC has been cancelled."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[ticket.guest.email],
                fail_silently=False,
            )
        except Exception as exc:
            logger.error("Failed to send cancellation email to %s: %s", ticket.guest.email, exc)


class EventListCreateView(generics.ListCreateAPIView):
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        expire_events()
        queryset = Event.objects.all().order_by("date")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    def perform_create(self, serializer):
        event = serializer.save(created_by=self.request.user)
        log_action(
            admin=self.request.user,
            action="create_event",
            detail={"event_id": str(event.id), "name": event.name},
            event=event,
        )


class EventDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def perform_update(self, serializer):
        event = serializer.save()
        log_action(
            admin=self.request.user,
            action="update_event",
            detail={"event_id": str(event.id), "name": event.name},
            event=event,
        )
        if event.status == "cancelled":
            _dispatch_cancellation_emails(event)

    def destroy(self, request, *args, **kwargs):
        event = self.get_object()
        event.status = "cancelled"
        event.save(update_fields=["status", "updated_at"])
        log_action(
            admin=request.user,
            action="cancel_event",
            detail={"event_id": str(event.id), "name": event.name},
            event=event,
        )
        _dispatch_cancellation_emails(event)
        serializer = self.get_serializer(event)
        return Response(serializer.data, status=status.HTTP_200_OK)


class EventStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            event = Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        confirmed = event.ticket_set.filter(status="confirmed").count()
        available_seats = event.capacity - confirmed
        return Response(
            {
                "capacity": event.capacity,
                "confirmed": confirmed,
                "available_seats": available_seats,
            }
        )


class AlertThresholdView(APIView):
    permission_classes = [IsAdmin]

    def _get_event(self, pk):
        try:
            return Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return None

    def get(self, request, pk):
        event = self._get_event(pk)
        if event is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "alert_threshold": event.alert_threshold,
                "alert_triggered": event.alert_triggered,
            }
        )

    def put(self, request, pk):
        event = self._get_event(pk)
        if event is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        threshold = request.data.get("alert_threshold")
        if threshold is None:
            return Response(
                {"alert_threshold": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            threshold = int(threshold)
            if threshold < 0:
                raise ValueError
        except (ValueError, TypeError):
            return Response(
                {"alert_threshold": ["Must be a non-negative integer."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        event.alert_threshold = threshold
        event.save(update_fields=["alert_threshold", "updated_at"])
        log_action(
            admin=request.user,
            action="set_alert_threshold",
            detail={"event_id": str(event.id), "alert_threshold": threshold},
            event=event,
        )
        return Response(
            {
                "alert_threshold": event.alert_threshold,
                "alert_triggered": event.alert_triggered,
            }
        )


class EventQRCodeView(APIView):
    """
    GET /api/events/{pk}/qr/
    Returns a base64 PNG QR code that encodes the event's public check-in URL.
    Staff display this at the entrance; guests scan to self-check-in.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            event = Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        checkin_url = f"{frontend_url}/checkin/event/{event.id}"

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(checkin_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        qr_b64 = base64.b64encode(buf.read()).decode()

        return Response({
            "event_id": str(event.id),
            "event_name": event.name,
            "event_date": event.date,
            "venue": event.venue,
            "checkin_url": checkin_url,
            "qr_code": f"data:image/png;base64,{qr_b64}",
        })
