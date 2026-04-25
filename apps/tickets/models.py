import uuid

from django.conf import settings
from django.db import models

from apps.events.models import Event, log_action


class Guest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)

    class Meta:
        app_label = "tickets"

    def __str__(self):
        return f"{self.name} <{self.email}>"


class Ticket(models.Model):
    STATUS_CHOICES = [
        ("confirmed", "Confirmed"),
        ("cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="ticket_set")
    guest = models.ForeignKey(Guest, on_delete=models.CASCADE, related_name="tickets")
    registered_at = models.DateTimeField(auto_now_add=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="registered_tickets",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="confirmed")

    class Meta:
        app_label = "tickets"
        constraints = [
            models.UniqueConstraint(fields=["event", "guest"], name="unique_ticket_per_guest_per_event")
        ]

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        action = "ticket_created" if is_new else "ticket_updated"
        log_action(
            admin=self.registered_by,
            action=action,
            detail={"ticket_id": str(self.id), "guest_email": self.guest.email, "status": self.status},
            event=self.event,
        )

    def __str__(self):
        return f"Ticket({self.guest.email}, {self.event})"
