from rest_framework import serializers

from apps.events.models import AuditLog
from apps.utils import sanitize_html
from .models import Guest, Ticket


class GuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "email", "name"]

    def validate_name(self, value):
        return sanitize_html(value)


class TicketSerializer(serializers.ModelSerializer):
    guest = GuestSerializer(read_only=True)

    class Meta:
        model = Ticket
        fields = ["id", "event", "guest", "registered_at", "registered_by", "status", "ticket_type", "checked_in", "checked_in_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ["id", "action", "detail", "timestamp", "admin"]
