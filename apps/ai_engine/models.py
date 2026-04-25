import uuid

from django.db import models

from apps.events.models import Event


class AIInsight(models.Model):
    INSIGHT_TYPE_CHOICES = [
        ("date_suggestion", "Date Suggestion"),
        ("capacity_suggestion", "Capacity Suggestion"),
        ("velocity_alert", "Velocity Alert"),
        ("weekly_summary", "Weekly Summary"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(
        Event,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_insights",
    )
    insight_type = models.CharField(max_length=30, choices=INSIGHT_TYPE_CHOICES)
    content = models.JSONField(default=dict)
    generated_at = models.DateTimeField(auto_now_add=True)
    is_limited_data = models.BooleanField(default=False)

    class Meta:
        app_label = "ai_engine"
        ordering = ["-generated_at"]

    def __str__(self):
        return f"{self.insight_type} @ {self.generated_at}"
