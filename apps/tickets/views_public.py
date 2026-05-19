"""Razorpay-integrated ticket purchase endpoints."""
import hashlib
import hmac
import logging

import razorpay
from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.alerts.service import check_and_dispatch_alert
from apps.events.models import Event
from apps.events.views import expire_events
from apps.realtime.consumers import send_event_update
from .models import Guest, Ticket
from .serializers import TicketSerializer

logger = logging.getLogger(__name__)


def _razorpay_client():
    return razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )


def _get_ticket_price(event: Event, ticket_type: str) -> float:
    if event.ticket_types and ticket_type in event.ticket_types:
        return float(event.ticket_types[ticket_type])
    return float(event.price)


class CreatePaymentOrderView(APIView):
    """
    POST /api/events/{event_pk}/payment/create-order/
    Creates a Razorpay order and returns the order_id + key for the frontend checkout.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, event_pk):
        expire_events()
        try:
            event = Event.objects.get(pk=event_pk)
        except Event.DoesNotExist:
            return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

        if event.status != "active":
            return Response(
                {"detail": "This event has ended and is no longer available for purchase."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if event.available_seats <= 0:
            return Response({"detail": "Event is sold out."}, status=status.HTTP_409_CONFLICT)

        ticket_type = request.data.get("ticket_type", "normal")
        email = request.data.get("email", "")
        name = request.data.get("name", "")

        if not email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        if event.ticket_types:
            if ticket_type not in event.ticket_types:
                return Response(
                    {"detail": f"Ticket type '{ticket_type}' is not available."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if event.ticket_types.get(ticket_type, 0) <= 0:
                return Response(
                    {"detail": f"Ticket type '{ticket_type}' is not available for purchase."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Check for duplicate ticket BEFORE creating the Razorpay order
        from .models import Guest as GuestModel
        existing_guest = GuestModel.objects.filter(email=email).first()
        if existing_guest:
            already_registered = Ticket.objects.filter(
                event=event, guest=existing_guest, status="confirmed"
            ).exists()
            if already_registered:
                return Response(
                    {"detail": "You have already purchased a ticket for this event."},
                    status=status.HTTP_409_CONFLICT,
                )

        price = _get_ticket_price(event, ticket_type)
        # Razorpay amount is in paise (INR smallest unit) — multiply by 100
        amount_paise = int(price * 100)

        try:
            client = _razorpay_client()
            # Receipt must be ≤ 40 chars — use short hash of event+user
            import hashlib as _hl
            receipt = _hl.md5(f"{event_pk}{request.user.id}".encode()).hexdigest()[:20]
            order = client.order.create({
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": {
                    "event_id": str(event_pk),
                    "ticket_type": ticket_type,
                    "guest_email": email,
                    "guest_name": name,
                },
            })
        except Exception as exc:
            logger.error("Razorpay order creation failed: %s", exc)
            return Response(
                {"detail": "Payment gateway error. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({
            "order_id": order["id"],
            "amount": amount_paise,
            "currency": "INR",
            "key": settings.RAZORPAY_KEY_ID,
            "event_name": event.name,
            "ticket_type": ticket_type,
            "price": price,
        })


class VerifyPaymentView(APIView):
    """
    POST /api/events/{event_pk}/payment/verify/
    Verifies Razorpay signature, then creates the ticket.
    Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature,
            name, email, ticket_type }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, event_pk):
        order_id = request.data.get("razorpay_order_id", "")
        payment_id = request.data.get("razorpay_payment_id", "")
        signature = request.data.get("razorpay_signature", "")
        name = request.data.get("name", "")
        email = request.data.get("email", "")
        ticket_type = request.data.get("ticket_type", "normal")

        if not all([order_id, payment_id, signature, email]):
            return Response({"detail": "Missing payment fields."}, status=status.HTTP_400_BAD_REQUEST)

        # Verify HMAC-SHA256 signature
        expected = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            return Response({"detail": "Payment verification failed."}, status=status.HTTP_400_BAD_REQUEST)

        # Payment verified — create the ticket
        try:
            with transaction.atomic():
                try:
                    event = Event.objects.select_for_update().get(pk=event_pk)
                except Event.DoesNotExist:
                    return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

                expire_events()
                event.refresh_from_db()

                if event.status != "active":
                    return Response(
                        {"detail": "This event has ended."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if event.available_seats <= 0:
                    return Response({"detail": "Event is sold out."}, status=status.HTTP_409_CONFLICT)

                guest, _ = Guest.objects.get_or_create(
                    email=email, defaults={"name": name}
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
            ticket_price = _get_ticket_price(event, ticket_type)
            # Format event date in local-friendly way
            event_date_str = event.date.strftime('%B %d, %Y at %I:%M %p UTC')
            send_mail(
                subject=f"🎟 Ticket Confirmed: {event.name}",
                message=(
                    f"Hi {name or guest.name},\n\n"
                    f"Your ticket has been confirmed! Here are your booking details:\n\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"  Event:       {event.name}\n"
                    f"  Date:        {event_date_str}\n"
                    f"  Venue:       {event.venue}\n"
                    f"  Ticket Type: {ticket_type.capitalize()}\n"
                    f"  Amount Paid: ₹{ticket_price}\n"
                    f"  Payment ID:  {payment_id}\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                    f"Please keep this email as your booking confirmation.\n\n"
                    f"We look forward to seeing you there!\n\n"
                    f"— EventHub Team"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[guest.email],
                fail_silently=False,
            )
            logger.info("Confirmation email sent to %s for event %s", guest.email, event.name)
        except Exception as exc:
            logger.error("Failed to send confirmation email to %s: %s", guest.email, exc)

        serializer = TicketSerializer(ticket)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
