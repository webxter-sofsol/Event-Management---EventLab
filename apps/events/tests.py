"""
Event app tests.
Covers: cancellation email dispatch (task 5.11, requirement 3.4).
"""

from unittest.mock import call, patch

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_service.models import User
from apps.events.models import Event
from apps.tickets.models import Guest, Ticket


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_user(email="admin@example.com", role="admin", password="Pass123!"):
    return User.objects.create_user(email=email, password=password, role=role)


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def make_event(user, capacity=10, status_val="active"):
    return Event.objects.create(
        name="Test Event",
        date=timezone.now() + timezone.timedelta(days=30),
        venue="Venue",
        price="0.00",
        type="conference",
        capacity=capacity,
        status=status_val,
        created_by=user,
    )


def make_ticket(event, user, email="guest@example.com", ticket_status="confirmed"):
    guest, _ = Guest.objects.get_or_create(email=email, defaults={"name": "Guest"})
    return Ticket.objects.create(
        event=event, guest=guest, registered_by=user, status=ticket_status
    )


def event_detail_url(pk):
    return f"/api/events/{pk}/"


# ─── Cancellation email via DELETE ────────────────────────────────────────────

class EventCancellationEmailDeleteTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = auth_client(self.user)
        self.event = make_event(self.user)

    @patch("apps.events.views.send_mail")
    def test_delete_sends_email_to_confirmed_guest(self, mock_send):
        ticket = make_ticket(self.event, self.user, email="guest@example.com")
        resp = self.client.delete(event_detail_url(self.event.pk))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        self.assertIn("guest@example.com", kwargs["recipient_list"])
        self.assertIn("Test Event", kwargs["subject"])

    @patch("apps.events.views.send_mail")
    def test_delete_sends_email_to_all_confirmed_guests(self, mock_send):
        make_ticket(self.event, self.user, email="a@example.com")
        make_ticket(self.event, self.user, email="b@example.com")
        self.client.delete(event_detail_url(self.event.pk))
        self.assertEqual(mock_send.call_count, 2)

    @patch("apps.events.views.send_mail")
    def test_delete_does_not_email_cancelled_ticket_holders(self, mock_send):
        make_ticket(self.event, self.user, email="cancelled@example.com", ticket_status="cancelled")
        self.client.delete(event_detail_url(self.event.pk))
        mock_send.assert_not_called()

    @patch("apps.events.views.send_mail")
    def test_delete_sends_no_emails_when_no_tickets(self, mock_send):
        self.client.delete(event_detail_url(self.event.pk))
        mock_send.assert_not_called()

    @patch("apps.events.views.send_mail", side_effect=Exception("SMTP error"))
    def test_delete_succeeds_even_if_email_fails(self, mock_send):
        make_ticket(self.event, self.user, email="guest@example.com")
        resp = self.client.delete(event_detail_url(self.event.pk))
        # Cancellation must succeed despite email failure
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    @patch("apps.events.views.send_mail", side_effect=Exception("SMTP error"))
    def test_delete_logs_email_failure(self, mock_send):
        make_ticket(self.event, self.user, email="guest@example.com")
        with self.assertLogs("apps.events.views", level="ERROR") as cm:
            self.client.delete(event_detail_url(self.event.pk))
        self.assertTrue(any("guest@example.com" in line for line in cm.output))

    @patch("apps.events.views.send_mail")
    def test_delete_email_subject_contains_event_name(self, mock_send):
        make_ticket(self.event, self.user, email="guest@example.com")
        self.client.delete(event_detail_url(self.event.pk))
        subject = mock_send.call_args[1]["subject"]
        self.assertIn("Test Event", subject)
        self.assertIn("Cancelled", subject)

    @patch("apps.events.views.send_mail")
    def test_delete_email_message_contains_event_date(self, mock_send):
        make_ticket(self.event, self.user, email="guest@example.com")
        self.client.delete(event_detail_url(self.event.pk))
        message = mock_send.call_args[1]["message"]
        self.assertIn("Test Event", message)


# ─── Cancellation email via PATCH/PUT ─────────────────────────────────────────

class EventCancellationEmailUpdateTests(TestCase):
    def setUp(self):
        self.user = make_user(email="admin2@example.com")
        self.client = auth_client(self.user)
        self.event = make_event(self.user)

    @patch("apps.events.views.send_mail")
    def test_patch_to_cancelled_sends_email(self, mock_send):
        make_ticket(self.event, self.user, email="guest@example.com")
        resp = self.client.patch(
            event_detail_url(self.event.pk), {"status": "cancelled"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        mock_send.assert_called_once()

    @patch("apps.events.views.send_mail")
    def test_patch_to_active_does_not_send_email(self, mock_send):
        make_ticket(self.event, self.user, email="guest@example.com")
        resp = self.client.patch(
            event_detail_url(self.event.pk), {"status": "active"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        mock_send.assert_not_called()

    @patch("apps.events.views.send_mail", side_effect=Exception("SMTP error"))
    def test_patch_to_cancelled_succeeds_even_if_email_fails(self, mock_send):
        make_ticket(self.event, self.user, email="guest@example.com")
        resp = self.client.patch(
            event_detail_url(self.event.pk), {"status": "cancelled"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    @patch("apps.events.views.send_mail")
    def test_patch_sends_email_to_all_confirmed_guests(self, mock_send):
        make_ticket(self.event, self.user, email="x@example.com")
        make_ticket(self.event, self.user, email="y@example.com")
        self.client.patch(
            event_detail_url(self.event.pk), {"status": "cancelled"}, format="json"
        )
        self.assertEqual(mock_send.call_count, 2)


# ─── Alert Threshold Views ─────────────────────────────────────────────────────

class AlertThresholdGetTests(TestCase):
    def setUp(self):
        self.user = make_user(email="admin3@example.com")
        self.client = auth_client(self.user)
        self.event = make_event(self.user)

    def test_get_returns_default_threshold(self):
        resp = self.client.get(f"/api/events/{self.event.pk}/alert-threshold/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["alert_threshold"], 10)
        self.assertEqual(resp.data["alert_triggered"], False)

    def test_get_returns_404_for_unknown_event(self):
        import uuid
        resp = self.client.get(f"/api/events/{uuid.uuid4()}/alert-threshold/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_requires_authentication(self):
        from rest_framework.test import APIClient
        anon = APIClient()
        resp = anon.get(f"/api/events/{self.event.pk}/alert-threshold/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AlertThresholdPutTests(TestCase):
    def setUp(self):
        self.user = make_user(email="admin4@example.com")
        self.client = auth_client(self.user)
        self.event = make_event(self.user)

    def test_put_updates_threshold(self):
        resp = self.client.put(
            f"/api/events/{self.event.pk}/alert-threshold/",
            {"alert_threshold": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["alert_threshold"], 5)
        self.event.refresh_from_db()
        self.assertEqual(self.event.alert_threshold, 5)

    def test_put_returns_404_for_unknown_event(self):
        import uuid
        resp = self.client.put(
            f"/api/events/{uuid.uuid4()}/alert-threshold/",
            {"alert_threshold": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_put_rejects_missing_threshold(self):
        resp = self.client.put(
            f"/api/events/{self.event.pk}/alert-threshold/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_rejects_negative_threshold(self):
        resp = self.client.put(
            f"/api/events/{self.event.pk}/alert-threshold/",
            {"alert_threshold": -1},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_rejects_non_integer_threshold(self):
        resp = self.client.put(
            f"/api/events/{self.event.pk}/alert-threshold/",
            {"alert_threshold": "abc"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_requires_admin_role(self):
        guest_user = make_user(email="guest_user@example.com", role="admin")
        # Non-admin (no role) user should be rejected — use a plain user with no role
        from apps.auth_service.models import User
        plain = User.objects.create_user(email="plain@example.com", password="Pass123!")
        plain.role = "guest"
        plain.save()
        plain_client = auth_client(plain)
        resp = plain_client.put(
            f"/api/events/{self.event.pk}/alert-threshold/",
            {"alert_threshold": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_put_logs_audit_action(self):
        from apps.events.models import AuditLog
        self.client.put(
            f"/api/events/{self.event.pk}/alert-threshold/",
            {"alert_threshold": 7},
            format="json",
        )
        log = AuditLog.objects.filter(action="set_alert_threshold", event=self.event).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.detail["alert_threshold"], 7)
