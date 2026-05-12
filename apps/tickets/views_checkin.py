"""QR code generation and check-in views."""
import base64
import io

import qrcode
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import log_action
from .models import Ticket


class TicketQRCodeView(APIView):
    """
    GET /api/events/{event_pk}/registrations/{ticket_pk}/qr/
    Returns ticket details + a base64-encoded PNG QR code.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, event_pk, ticket_pk):
        try:
            ticket = Ticket.objects.select_related("guest", "event").get(
                pk=ticket_pk, event__pk=event_pk
            )
        except Ticket.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # QR encodes the token directly — backend looks it up by token
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(ticket.qr_token)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        qr_b64 = base64.b64encode(buf.read()).decode()

        return Response({
            "ticket_id": str(ticket.id),
            "guest_name": ticket.guest.name,
            "guest_email": ticket.guest.email,
            "event_name": ticket.event.name,
            "event_date": ticket.event.date,
            "venue": ticket.event.venue,
            "ticket_type": ticket.ticket_type,
            "status": ticket.status,
            "checked_in": ticket.checked_in,
            "checked_in_at": ticket.checked_in_at,
            "qr_code": f"data:image/png;base64,{qr_b64}",
        })


class CheckInView(APIView):
    """
    POST /api/checkin/
    Body: { "token": "<qr_token>" }
    Validates the QR token and marks the ticket as checked in.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("token", "").strip()
        if not token:
            return Response(
                {"detail": "Token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ticket = Ticket.objects.select_related("guest", "event").get(qr_token=token)
        except Ticket.DoesNotExist:
            return Response(
                {"valid": False, "detail": "Invalid QR code — ticket not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if ticket.status != "confirmed":
            return Response(
                {"valid": False, "detail": "Ticket is cancelled and cannot be used."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ticket.checked_in:
            return Response(
                {
                    "valid": False,
                    "already_checked_in": True,
                    "detail": "Ticket already scanned.",
                    "checked_in_at": ticket.checked_in_at,
                    "guest_name": ticket.guest.name,
                    "guest_email": ticket.guest.email,
                    "event_name": ticket.event.name,
                    "ticket_type": ticket.ticket_type,
                },
                status=status.HTTP_409_CONFLICT,
            )

        ticket.checked_in = True
        ticket.checked_in_at = timezone.now()
        ticket.save(update_fields=["checked_in", "checked_in_at"])

        log_action(
            admin=request.user,
            action="ticket_checked_in",
            detail={
                "ticket_id": str(ticket.id),
                "guest_email": ticket.guest.email,
                "ticket_type": ticket.ticket_type,
            },
            event=ticket.event,
        )

        return Response({
            "valid": True,
            "detail": "Check-in successful! Welcome.",
            "ticket_id": str(ticket.id),
            "guest_name": ticket.guest.name,
            "guest_email": ticket.guest.email,
            "event_name": ticket.event.name,
            "venue": ticket.event.venue,
            "ticket_type": ticket.ticket_type,
            "checked_in_at": ticket.checked_in_at,
        })


class EventSelfCheckInView(APIView):
    """
    POST /api/checkin/event/{event_pk}/
    Body: { "email": "guest@example.com" }
    Guest scans the event QR code, enters their email, gets checked in.
    No auth required — public endpoint.
    """
    permission_classes = []

    def post(self, request, event_pk):
        from apps.events.models import Event
        from .models import Guest

        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response(
                {"detail": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            event = Event.objects.get(pk=event_pk)
        except Event.DoesNotExist:
            return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            guest = Guest.objects.get(email=email)
        except Guest.DoesNotExist:
            return Response(
                {"valid": False, "detail": "No ticket found for this email address."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            ticket = Ticket.objects.select_related("guest", "event").get(
                event=event, guest=guest, status="confirmed"
            )
        except Ticket.DoesNotExist:
            return Response(
                {"valid": False, "detail": "No confirmed ticket found for this email at this event."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if ticket.checked_in:
            return Response(
                {
                    "valid": False,
                    "already_checked_in": True,
                    "detail": "You have already checked in.",
                    "checked_in_at": ticket.checked_in_at,
                    "guest_name": ticket.guest.name,
                    "event_name": ticket.event.name,
                    "ticket_type": ticket.ticket_type,
                },
                status=status.HTTP_409_CONFLICT,
            )

        ticket.checked_in = True
        ticket.checked_in_at = timezone.now()
        ticket.save(update_fields=["checked_in", "checked_in_at"])

        return Response({
            "valid": True,
            "detail": "Check-in successful! Welcome.",
            "guest_name": ticket.guest.name,
            "guest_email": ticket.guest.email,
            "event_name": ticket.event.name,
            "venue": ticket.event.venue,
            "ticket_type": ticket.ticket_type,
            "checked_in_at": ticket.checked_in_at,
        })
