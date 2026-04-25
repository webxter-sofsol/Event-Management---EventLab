from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.alerts.models import Alert
from apps.alerts.service import check_and_dispatch_alert
from apps.auth_service.models import User
from apps.events.models import Event
from apps.tickets.models import Guest, Ticket


def make_user(email="admin@example.com"):
    return User.objects.create_user(email=email, password="pass")


def make_event(user, capacity=50, alert_threshold=10, alert_triggered=False):
    return Event.objects.create(
        name="Test Event",
        date=timezone.now() + timezone.timedelta(days=30),
        venue="Venue",
        price="10.00",
        type="conference",
        capacity=capacity,
        alert_threshold=alert_threshold,
        alert_triggered=alert_triggered,
        created_by=user,
    )


def add_confirmed_tickets(event, admin, count):
    """Create `count` confirmed tickets for the event."""
    tickets = []
    for i in range(count):
        guest = Guest.objects.create(email=f"guest{i}_{event.pk}@example.com", name=f"Guest {i}")
        ticket = Ticket(event=event, guest=guest, registered_by=admin, status="confirmed")
        # bypass save() audit log side-effect by calling super directly
        Ticket.save(ticket)
        tickets.append(ticket)
    return tickets


class CheckAndDispatchAlertTests(TestCase):

    def setUp(self):
        self.admin = make_user()

    # ── Helper ────────────────────────────────────────────────────────────────

    _ticket_counter = 0

    def _add_tickets(self, event, count):
        """Add confirmed tickets with globally unique guest emails."""
        for _ in range(count):
            CheckAndDispatchAlertTests._ticket_counter += 1
            seq = CheckAndDispatchAlertTests._ticket_counter
            guest = Guest.objects.create(
                email=f"guest{seq}@example.com", name=f"Guest {seq}"
            )
            Ticket.objects.create(
                event=event, guest=guest, registered_by=self.admin, status="confirmed"
            )

    # ── Test 1: Alert fires when seats drop below threshold ───────────────────

    @patch("apps.alerts.service.send_mail")
    def test_alert_fires_when_below_threshold(self, mock_send_mail):
        """Alert is created and email sent when available seats < threshold and not yet triggered."""
        event = make_event(self.admin, capacity=15, alert_threshold=10)
        # Add 6 confirmed tickets → available = 15 - 6 = 9 < 10
        self._add_tickets(event, 6)

        check_and_dispatch_alert(event.pk)

        event.refresh_from_db()
        self.assertTrue(event.alert_triggered)

        alerts = Alert.objects.filter(event=event)
        self.assertEqual(alerts.count(), 1)
        self.assertIn("9", alerts.first().message)

        mock_send_mail.assert_called_once()
        call_kwargs = mock_send_mail.call_args
        self.assertIn(self.admin.email, call_kwargs[1]["recipient_list"])

    # ── Test 2: Alert does NOT fire again when already triggered ──────────────

    @patch("apps.alerts.service.send_mail")
    def test_alert_does_not_fire_again_when_already_triggered(self, mock_send_mail):
        """No duplicate alert when alert_triggered is already True."""
        event = make_event(self.admin, capacity=15, alert_threshold=10, alert_triggered=True)
        # Still below threshold
        self._add_tickets(event, 6)

        check_and_dispatch_alert(event.pk)

        # No new Alert records, no email
        self.assertEqual(Alert.objects.filter(event=event).count(), 0)
        mock_send_mail.assert_not_called()

        # alert_triggered remains True
        event.refresh_from_db()
        self.assertTrue(event.alert_triggered)

    # ── Test 3: Alert state resets when seats rise above threshold ────────────

    @patch("apps.alerts.service.send_mail")
    def test_alert_resets_when_seats_rise_above_threshold(self, mock_send_mail):
        """alert_triggered is reset to False when available seats >= threshold."""
        event = make_event(self.admin, capacity=20, alert_threshold=10, alert_triggered=True)
        # Only 5 confirmed tickets → available = 15 >= 10
        self._add_tickets(event, 5)

        check_and_dispatch_alert(event.pk)

        event.refresh_from_db()
        self.assertFalse(event.alert_triggered)
        # No new alert or email on reset
        self.assertEqual(Alert.objects.filter(event=event).count(), 0)
        mock_send_mail.assert_not_called()

    # ── Test 4: Email sent to managing admin on alert dispatch ────────────────

    @patch("apps.alerts.service.send_mail")
    def test_email_sent_to_managing_admin(self, mock_send_mail):
        """Email is sent to event.created_by.email when alert fires."""
        admin = make_user("organiser@example.com")
        event = make_event(admin, capacity=12, alert_threshold=5)
        # 8 confirmed → available = 4 < 5
        self._add_tickets(event, 8)

        check_and_dispatch_alert(event.pk)

        mock_send_mail.assert_called_once()
        _, kwargs = mock_send_mail.call_args
        self.assertEqual(kwargs["recipient_list"], ["organiser@example.com"])
        self.assertIn("Low Ticket Alert", kwargs["subject"])

    # ── Test 5: No alert when seats exactly equal threshold ───────────────────

    @patch("apps.alerts.service.send_mail")
    def test_no_alert_when_seats_equal_threshold(self, mock_send_mail):
        """Alert does NOT fire when available seats == threshold (boundary)."""
        event = make_event(self.admin, capacity=20, alert_threshold=10)
        # 10 confirmed → available = 10, not < 10
        self._add_tickets(event, 10)

        check_and_dispatch_alert(event.pk)

        event.refresh_from_db()
        self.assertFalse(event.alert_triggered)
        self.assertEqual(Alert.objects.filter(event=event).count(), 0)
        mock_send_mail.assert_not_called()

    # ── Test 6: Non-existent event_id is handled gracefully ──────────────────

    def test_nonexistent_event_id_does_not_raise(self):
        """check_and_dispatch_alert silently returns for unknown event IDs."""
        import uuid
        check_and_dispatch_alert(uuid.uuid4())  # should not raise

    # ── Test 7: Re-trigger after reset ───────────────────────────────────────

    @patch("apps.alerts.service.send_mail")
    def test_alert_fires_again_after_reset(self, mock_send_mail):
        """After a reset, a new threshold crossing fires a fresh alert."""
        event = make_event(self.admin, capacity=20, alert_threshold=5)
        # First crossing: 16 tickets → available = 4 < 5
        self._add_tickets(event, 16)
        check_and_dispatch_alert(event.pk)
        event.refresh_from_db()
        self.assertTrue(event.alert_triggered)
        self.assertEqual(Alert.objects.filter(event=event).count(), 1)

        # Simulate cancellations bringing seats back up: delete tickets to get available >= 5
        Ticket.objects.filter(event=event).delete()
        check_and_dispatch_alert(event.pk)
        event.refresh_from_db()
        self.assertFalse(event.alert_triggered)

        # Second crossing: add tickets again
        self._add_tickets(event, 16)
        check_and_dispatch_alert(event.pk)
        event.refresh_from_db()
        self.assertTrue(event.alert_triggered)
        self.assertEqual(Alert.objects.filter(event=event).count(), 2)
        self.assertEqual(mock_send_mail.call_count, 2)
