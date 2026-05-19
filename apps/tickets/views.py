import logging

from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.conf import settings
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.alerts.service import check_and_dispatch_alert
from apps.events.models import AuditLog, Event, log_action
from apps.realtime.consumers import send_event_update
from .models import Guest, Ticket
from .serializers import AuditLogSerializer, TicketSerializer

logger = logging.getLogger(__name__)


class RegistrationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, event_pk):
        try:
            event = Event.objects.get(pk=event_pk)
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        tickets = Ticket.objects.filter(event=event, status="confirmed").select_related("guest")
        serializer = TicketSerializer(tickets, many=True)
        return Response(serializer.data)

    def post(self, request, event_pk):
        try:
            with transaction.atomic():
                try:
                    event = Event.objects.select_for_update().get(pk=event_pk)
                except Event.DoesNotExist:
                    return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

                # Auto-expire then check status
                from apps.events.views import expire_events
                expire_events()
                event.refresh_from_db()

                if event.status != "active":
                    return Response(
                        {"detail": "This event has ended and is no longer accepting registrations."},
                        status=status.HTTP_409_CONFLICT,
                    )

                if event.available_seats <= 0:
                    return Response(
                        {"detail": "Event is at capacity"},
                        status=status.HTTP_409_CONFLICT,
                    )

                email = request.data.get("email")
                name = request.data.get("name", "")
                ticket_type = request.data.get("ticket_type", "normal")
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
                {"detail": "Guest is already registered for this event"},
                status=status.HTTP_409_CONFLICT,
            )

        check_and_dispatch_alert(event.pk)
        send_event_update(event.pk)

        try:
            send_mail(
                subject="Registration Confirmed",
                message=(
                    f"Your registration for '{event.name}' on "
                    f"{event.date.strftime('%Y-%m-%d %H:%M')} UTC has been confirmed."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[guest.email],
                fail_silently=False,
            )
        except Exception as exc:
            logger.error("Failed to send confirmation email to %s: %s", guest.email, exc)

        serializer = TicketSerializer(ticket)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class BulkRegistrationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, event_pk):
        emails = request.data.get("emails")
        if not emails or not isinstance(emails, list):
            return Response(
                {"detail": "emails must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket_type = request.data.get("ticket_type", "normal")

        succeeded = []
        failed = []

        with transaction.atomic():
            try:
                event = Event.objects.select_for_update().get(pk=event_pk)
            except Event.DoesNotExist:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

            # Auto-expire then check status
            from apps.events.views import expire_events
            expire_events()
            event.refresh_from_db()

            if event.status != "active":
                return Response(
                    {"detail": "This event has ended and is no longer accepting registrations."},
                    status=status.HTTP_409_CONFLICT,
                )

            for email in emails:
                if event.available_seats <= 0:
                    failed.append({"email": email, "reason": "Event is at capacity"})
                    continue

                try:
                    with transaction.atomic():
                        name = email.split("@")[0]
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
                    failed.append({"email": email, "reason": "Already registered"})
                    continue

                succeeded.append(email)

                try:
                    send_mail(
                        subject="Registration Confirmed",
                        message=(
                            f"Your registration for '{event.name}' on "
                            f"{event.date.strftime('%Y-%m-%d %H:%M')} UTC has been confirmed."
                        ),
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[email],
                        fail_silently=False,
                    )
                except Exception as exc:
                    logger.error("Failed to send confirmation email to %s: %s", email, exc)

        check_and_dispatch_alert(event.pk)
        send_event_update(event.pk)

        return Response(
            {
                "succeeded": len(succeeded),
                "failed": len(failed),
                "details": {
                    "succeeded": succeeded,
                    "failed": failed,
                },
            },
            status=status.HTTP_200_OK,
        )


class RegistrationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, event_pk, ticket_pk):
        try:
            event = Event.objects.get(pk=event_pk)
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            ticket = Ticket.objects.get(pk=ticket_pk, event=event)
        except Ticket.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        log_action(
            admin=request.user,
            action="remove_guest",
            detail={"ticket_id": str(ticket.id), "guest_email": ticket.guest.email},
            event=event,
        )
        ticket.delete()
        check_and_dispatch_alert(event.pk)
        send_event_update(event.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegistrationLogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, event_pk):
        try:
            event = Event.objects.get(pk=event_pk)
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        logs = AuditLog.objects.filter(event=event).order_by("-timestamp")
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(logs, request)
        return paginator.get_paginated_response(AuditLogSerializer(page, many=True).data)
