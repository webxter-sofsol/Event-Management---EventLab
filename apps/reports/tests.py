"""
Report service tests.
Covers: EventReportView (task 8.1) and EventReportExportView (task 8.2).
"""

import csv
import io
import uuid
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
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


def make_event(user, capacity=10, price="25.00"):
    return Event.objects.create(
        name="Report Test Event",
        date=timezone.now() + timezone.timedelta(days=30),
        venue="Test Venue",
        price=price,
        type="conference",
        capacity=capacity,
        created_by=user,
    )


def make_ticket(event, user, email, name="Guest"):
    guest, _ = Guest.objects.get_or_create(email=email, defaults={"name": name})
    return Ticket.objects.create(event=event, guest=guest, registered_by=user, status="confirmed")


def report_url(event_pk):
    return f"/api/events/{event_pk}/report/"


def export_url(event_pk):
    return f"/api/events/{event_pk}/report/export/"


# ─── EventReportView ──────────────────────────────────────────────────────────

class EventReportViewTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = auth_client(self.user)
        self.event = make_event(self.user, capacity=10, price="25.00")

    def test_report_requires_auth(self):
        anon = APIClient()
        resp = anon.get(report_url(self.event.pk))
        self.assertEqual(resp.status_code, 401)

    def test_report_not_found(self):
        resp = self.client.get(report_url(uuid.uuid4()))
        self.assertEqual(resp.status_code, 404)

    def test_report_empty_event(self):
        resp = self.client.get(report_url(self.event.pk))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_registrations"], 0)
        self.assertEqual(data["available_seats"], 10)
        self.assertEqual(data["revenue"], "0.00")
        self.assertEqual(data["guest_list"], [])

    def test_report_with_registrations(self):
        make_ticket(self.event, self.user, "alice@example.com", "Alice")
        make_ticket(self.event, self.user, "bob@example.com", "Bob")

        resp = self.client.get(report_url(self.event.pk))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["total_registrations"], 2)
        self.assertEqual(data["available_seats"], 8)
        # revenue = 2 × 25.00 = 50.00
        self.assertEqual(Decimal(data["revenue"]), Decimal("50.00"))
        emails = {g["email"] for g in data["guest_list"]}
        self.assertIn("alice@example.com", emails)
        self.assertIn("bob@example.com", emails)

    def test_report_contains_required_fields(self):
        resp = self.client.get(report_url(self.event.pk))
        data = resp.json()
        for field in ("event_id", "event_name", "total_registrations", "available_seats", "revenue", "guest_list"):
            self.assertIn(field, data)

    def test_report_excludes_cancelled_tickets(self):
        t = make_ticket(self.event, self.user, "cancelled@example.com", "Cancelled")
        t.status = "cancelled"
        t.save()

        resp = self.client.get(report_url(self.event.pk))
        data = resp.json()
        self.assertEqual(data["total_registrations"], 0)


# ─── EventReportExportView ────────────────────────────────────────────────────

class EventReportExportViewTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = auth_client(self.user)
        self.event = make_event(self.user, capacity=5, price="10.00")

    def test_export_requires_auth(self):
        anon = APIClient()
        resp = anon.get(export_url(self.event.pk))
        self.assertEqual(resp.status_code, 401)

    def test_export_not_found(self):
        resp = self.client.get(export_url(uuid.uuid4()))
        self.assertEqual(resp.status_code, 404)

    def test_export_content_type_is_csv(self):
        resp = self.client.get(export_url(self.event.pk))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])

    def test_export_content_disposition(self):
        resp = self.client.get(export_url(self.event.pk))
        self.assertIn("attachment", resp["Content-Disposition"])
        self.assertIn(".csv", resp["Content-Disposition"])

    def test_export_is_parseable_csv(self):
        make_ticket(self.event, self.user, "guest1@example.com", "Guest One")
        make_ticket(self.event, self.user, "guest2@example.com", "Guest Two")

        resp = self.client.get(export_url(self.event.pk))
        content = b"".join(resp.streaming_content).decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        # Should have summary rows + blank + header + 2 guest rows
        self.assertGreater(len(rows), 5)

    def test_export_guest_emails_present(self):
        make_ticket(self.event, self.user, "export_guest@example.com", "Export Guest")

        resp = self.client.get(export_url(self.event.pk))
        content = b"".join(resp.streaming_content).decode("utf-8")
        self.assertIn("export_guest@example.com", content)

    def test_export_revenue_in_summary(self):
        make_ticket(self.event, self.user, "rev@example.com", "Rev Guest")

        resp = self.client.get(export_url(self.event.pk))
        content = b"".join(resp.streaming_content).decode("utf-8")
        # 1 ticket × £10.00
        self.assertIn("10.00", content)
