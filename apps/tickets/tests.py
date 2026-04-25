"""
Ticket app tests.
Covers: RegistrationDetailView DELETE endpoint (task 5.3).
"""

import uuid
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_service.models import User
from apps.events.models import AuditLog, Event
from apps.tickets.models import Guest, Ticket


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_user(email="admin@example.com", role="admin", password="Pass123!"):
    return User.objects.create_user(email=email, password=password, role=role)


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def make_event(user, capacity=10):
    return Event.objects.create(
        name="Test Event",
        date=timezone.now() + timezone.timedelta(days=30),
        venue="Venue",
        price="0.00",
        type="conference",
        capacity=capacity,
        created_by=user,
    )


def make_ticket(event, user, email="guest@example.com"):
    guest, _ = Guest.objects.get_or_create(email=email, defaults={"name": "Guest"})
    return Ticket.objects.create(event=event, guest=guest, registered_by=user, status="confirmed")


def detail_url(event_pk, ticket_pk):
    return f"/api/events/{event_pk}/registrations/{ticket_pk}/"


# ─── RegistrationDetailView DELETE ────────────────────────────────────────────

class RegistrationDeleteTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = auth_client(self.user)
        self.event = make_event(self.user)
        self.ticket = make_ticket(self.event, self.user)

    def test_delete_ticket_returns_204(self):
        resp = self.client.delete(detail_url(self.event.pk, self.ticket.pk))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_delete_removes_ticket_from_db(self):
        ticket_pk = self.ticket.pk
        self.client.delete(detail_url(self.event.pk, self.ticket.pk))
        self.assertFalse(Ticket.objects.filter(pk=ticket_pk).exists())

    def test_delete_increments_available_seats(self):
        seats_before = self.event.available_seats
        self.client.delete(detail_url(self.event.pk, self.ticket.pk))
        self.event.refresh_from_db()
        self.assertEqual(self.event.available_seats, seats_before + 1)

    def test_delete_writes_audit_log(self):
        self.client.delete(detail_url(self.event.pk, self.ticket.pk))
        log = AuditLog.objects.filter(event=self.event, action="remove_guest").last()
        self.assertIsNotNone(log)
        self.assertEqual(log.detail["guest_email"], self.ticket.guest.email)
        self.assertEqual(log.detail["ticket_id"], str(self.ticket.pk))

    def test_delete_audit_log_references_correct_admin(self):
        self.client.delete(detail_url(self.event.pk, self.ticket.pk))
        log = AuditLog.objects.filter(event=self.event, action="remove_guest").last()
        self.assertEqual(log.admin, self.user)

    def test_delete_nonexistent_ticket_returns_404(self):
        resp = self.client.delete(detail_url(self.event.pk, uuid.uuid4()))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_nonexistent_event_returns_404(self):
        resp = self.client.delete(detail_url(uuid.uuid4(), self.ticket.pk))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_ticket_belonging_to_different_event_returns_404(self):
        other_event = make_event(self.user, capacity=5)
        other_ticket = make_ticket(other_event, self.user, email="other@example.com")
        # Try to delete other_ticket via self.event's URL
        resp = self.client.delete(detail_url(self.event.pk, other_ticket.pk))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_requires_authentication(self):
        resp = APIClient().delete(detail_url(self.event.pk, self.ticket.pk))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── RegistrationLogView GET ───────────────────────────────────────────────────

def log_url(event_pk):
    return f"/api/events/{event_pk}/registrations/log/"


class RegistrationLogViewTests(TestCase):
    def setUp(self):
        self.user = make_user(email="logadmin@example.com")
        self.client = auth_client(self.user)
        self.event = make_event(self.user)

    def test_returns_200_for_valid_event(self):
        resp = self.client.get(log_url(self.event.pk))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_returns_404_for_nonexistent_event(self):
        resp = self.client.get(log_url(uuid.uuid4()))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_requires_authentication(self):
        resp = APIClient().get(log_url(self.event.pk))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_paginated_response(self):
        resp = self.client.get(log_url(self.event.pk))
        self.assertIn("results", resp.data)
        self.assertIn("count", resp.data)

    def test_returns_audit_log_entries_for_event(self):
        ticket = make_ticket(self.event, self.user)
        self.client.delete(detail_url(self.event.pk, ticket.pk))  # creates an audit log entry

        resp = self.client.get(log_url(self.event.pk))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)
        # Verify entry shape
        entry = resp.data["results"][0]
        self.assertIn("id", entry)
        self.assertIn("action", entry)
        self.assertIn("detail", entry)
        self.assertIn("timestamp", entry)
        self.assertIn("admin", entry)
        # Both ticket_created and remove_guest entries should be present
        actions = [e["action"] for e in resp.data["results"]]
        self.assertIn("remove_guest", actions)

    def test_does_not_return_logs_from_other_events(self):
        other_event = make_event(self.user, capacity=5)
        other_ticket = make_ticket(other_event, self.user, email="other2@example.com")
        # Create audit log for other_event
        self.client.delete(detail_url(other_event.pk, other_ticket.pk))

        resp = self.client.get(log_url(self.event.pk))
        self.assertEqual(resp.data["count"], 0)

    def test_entries_ordered_by_timestamp_descending(self):
        ticket1 = make_ticket(self.event, self.user, email="a@example.com")
        ticket2 = make_ticket(self.event, self.user, email="b@example.com")
        self.client.delete(detail_url(self.event.pk, ticket1.pk))
        self.client.delete(detail_url(self.event.pk, ticket2.pk))

        resp = self.client.get(log_url(self.event.pk))
        timestamps = [e["timestamp"] for e in resp.data["results"]]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))


# ─── Alert dispatch after ticket mutations (task 7.3) ─────────────────────────

def register_url(event_pk):
    return f"/api/events/{event_pk}/registrations/"


def bulk_url(event_pk):
    return f"/api/events/{event_pk}/registrations/bulk/"


class AlertDispatchOnTicketCreateTests(TestCase):
    """check_and_dispatch_alert is called after single and bulk ticket creation."""

    def setUp(self):
        self.user = make_user(email="alertcreate@example.com")
        self.client = auth_client(self.user)
        self.event = make_event(self.user, capacity=10)

    @patch("apps.tickets.views.check_and_dispatch_alert")
    def test_single_registration_calls_alert_dispatch(self, mock_dispatch):
        with patch("apps.tickets.views.send_mail"):
            resp = self.client.post(
                register_url(self.event.pk),
                {"email": "guest1@example.com", "name": "Guest One"},
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        mock_dispatch.assert_called_once_with(self.event.pk)

    @patch("apps.tickets.views.check_and_dispatch_alert")
    def test_bulk_registration_calls_alert_dispatch(self, mock_dispatch):
        with patch("apps.tickets.views.send_mail"):
            resp = self.client.post(
                bulk_url(self.event.pk),
                {"emails": ["bulk1@example.com", "bulk2@example.com"]},
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        mock_dispatch.assert_called_once_with(self.event.pk)

    @patch("apps.tickets.views.check_and_dispatch_alert")
    def test_single_registration_duplicate_does_not_call_alert_dispatch(self, mock_dispatch):
        """On IntegrityError (duplicate), alert should NOT be dispatched."""
        make_ticket(self.event, self.user, email="dup@example.com")
        with patch("apps.tickets.views.send_mail"):
            resp = self.client.post(
                register_url(self.event.pk),
                {"email": "dup@example.com", "name": "Dup"},
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        mock_dispatch.assert_not_called()


class AlertDispatchOnTicketDeleteTests(TestCase):
    """check_and_dispatch_alert is called after ticket deletion."""

    def setUp(self):
        self.user = make_user(email="alertdelete@example.com")
        self.client = auth_client(self.user)
        self.event = make_event(self.user, capacity=10)
        self.ticket = make_ticket(self.event, self.user, email="todelete@example.com")

    @patch("apps.tickets.views.check_and_dispatch_alert")
    def test_delete_ticket_calls_alert_dispatch(self, mock_dispatch):
        resp = self.client.delete(detail_url(self.event.pk, self.ticket.pk))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        mock_dispatch.assert_called_once_with(self.event.pk)

    @patch("apps.tickets.views.check_and_dispatch_alert")
    def test_delete_nonexistent_ticket_does_not_call_alert_dispatch(self, mock_dispatch):
        import uuid as _uuid
        resp = self.client.delete(detail_url(self.event.pk, _uuid.uuid4()))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        mock_dispatch.assert_not_called()
