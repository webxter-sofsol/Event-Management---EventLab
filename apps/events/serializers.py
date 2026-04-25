from django.utils import timezone
from rest_framework import serializers

from apps.utils import sanitize_html

from .models import Event

# Django ORM uses parameterised queries by default, which prevents SQL injection.
# All database interactions in this project go through the ORM — raw SQL is not used.

VALID_EVENT_TYPES = [choice[0] for choice in Event.EVENT_TYPE_CHOICES]


class EventSerializer(serializers.ModelSerializer):
    available_seats = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id",
            "name",
            "date",
            "venue",
            "price",
            "type",
            "capacity",
            "status",
            "alert_threshold",
            "alert_triggered",
            "created_by",
            "created_at",
            "updated_at",
            "available_seats",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "alert_triggered", "available_seats"]

    def get_available_seats(self, obj):
        return obj.available_seats

    def validate_name(self, value):
        return sanitize_html(value)

    def validate_venue(self, value):
        return sanitize_html(value)

    def validate_date(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Event date must be in the future.")
        return value

    def validate_type(self, value):
        if value not in VALID_EVENT_TYPES:
            raise serializers.ValidationError(
                f"Event type must be one of: {', '.join(VALID_EVENT_TYPES)}."
            )
        return value

    def validate(self, attrs):
        # On update, validate capacity >= confirmed registrations
        instance = self.instance
        if instance is not None and "capacity" in attrs:
            new_capacity = attrs["capacity"]
            confirmed_count = instance.ticket_set.filter(status="confirmed").count()
            if new_capacity < confirmed_count:
                raise serializers.ValidationError(
                    {
                        "capacity": (
                            f"Capacity cannot be reduced below the current number of confirmed "
                            f"registrations ({confirmed_count})."
                        )
                    }
                )
        return attrs
