import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Event(models.Model):
    EVENT_TYPE_CHOICES = [
        ("conference", "Conference"),
        ("workshop", "Workshop"),
        ("social", "Social"),
        ("webinar", "Webinar"),
        ("other", "Other"),
    ]

    STATUS_CHOICES = [
        ("active", "Active"),
        ("cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    date = models.DateTimeField()
    venue = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)  # kept for backward compatibility
    type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES)
    capacity = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    alert_threshold = models.PositiveIntegerField(default=10)
    alert_triggered = models.BooleanField(default=False)
    ticket_types = models.JSONField(default=dict, blank=True)  # e.g. {"normal": 50, "silver": 100, "platinum": 200}
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_events",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "events"

    def clean(self):
        if self.date and self.date <= timezone.now():
            raise ValidationError({"date": "Event date must be in the future."})

        valid_types = [choice[0] for choice in self.EVENT_TYPE_CHOICES]
        if self.type and self.type not in valid_types:
            raise ValidationError({"type": f"Event type must be one of: {', '.join(valid_types)}."})

    @property
    def available_seats(self):
        confirmed = self.ticket_set.filter(status="confirmed").count()
        return self.capacity - confirmed

    def __str__(self):
        return self.name


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(
        Event,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100)
    detail = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "events"

    def __str__(self):
        return f"{self.action} by {self.admin} at {self.timestamp}"


def log_action(admin, action, detail, event=None):
    """Create an AuditLog entry for an admin action."""
    return AuditLog.objects.create(
        admin=admin,
        action=action,
        detail=detail,
        event=event,
    )
