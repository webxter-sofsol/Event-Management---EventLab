"""Public ticket purchase endpoint for end users."""
import logging

from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.alerts.service import check_and_dispatch_alert
from apps.events.models import Event
from apps.realtime.consumers import send_event_update
from .models import Guest, Ticket
from .serializers import TicketSerializer

logger = logging.getLogger(__name__)


class PublicTicketPurchaseView(APIView):
    """
    POST /api/events/{event_pk}/purchase/
    Allows authenticated users to purchase tickets for themselves.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, event_pk):
        try:
            with transaction.atomic():
                try:
                    event = Event.objects.select_for_update().get(pk=event_pk)
                except Event.DoesNotExist:
                    return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

                if event.status != "active":
                    return Response(
                        {"detail": "This event is not available for purchase."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if event.available_seats <= 0:
                    return Response(
                        {"detail": "Event is sold out."},
                        status=status.HTTP_409_CONFLICT,
                    )

                email = request.data.get("email")
                name = request.data.get("name", "")
                ticket_type = request.data.get("ticket_type", "normal")

                if not email:
                    return Response(
                        {"detail": "Email is required."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Validate ticket type is available for this event
                if event.ticket_types and ticket_type not in event.ticket_types:
                    return Response(
                        {"detail": f"Ticket type '{ticket_type}' is not available for this event."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if event.ticket_types and event.ticket_types.get(ticket_type, 0) <= 0:
                    return Response(
                        {"detail": f"Ticket type '{ticket_type}' is not available for purchase."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                guest, _ = Guest.objects.get_or_create(
                    email=email,
                    defaults={"name": name},
                )

                ticket = Ticket(
                    event=event,
                    guest=guest,
                    registered_by=request.user,
                    status="confirmed",
                    ticket_type=ticket_type,
                )
                ticket.save()

        except IntegrityError:
            return Response(
                {"detail": "You have already purchased a ticket for this event."},
                status=status.HTTP_409_CONFLICT,
            )

        check_and_dispatch_alert(event.pk)
        send_event_update(event.pk)

        try:
            ticket_price = event.ticket_types.get(ticket_type, event.price) if event.ticket_types else event.price
            send_mail(
                subject=f"Ticket Confirmation: {event.name}",
                message=(
                    f"Thank you for your purchase!\n\n"
                    f"Event: {event.name}\n"
                    f"Date: {event.date.strftime('%Y-%m-%d %H:%M')} UTC\n"
                    f"Venue: {event.venue}\n"
                    f"Ticket Type: {ticket_type.capitalize()}\n"
                    f"Price: ${ticket_price}\n\n"
                    f"We look forward to seeing you there!"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[guest.email],
                fail_silently=False,
            )
        except Exception as exc:
            logger.error("Failed to send confirmation email to %s: %s", guest.email, exc)

        serializer = TicketSerializer(ticket)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
