import uuid

from django.db import models

from apps.events.models import Event


class Alert(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="alerts")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        app_label = "alerts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Alert for {self.event} at {self.created_at}"
