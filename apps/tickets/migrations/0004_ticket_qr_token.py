import hashlib
import hmac

from django.conf import settings
from django.db import migrations, models


def generate_qr_tokens(apps, schema_editor):
    """Backfill qr_token for all existing tickets."""
    Ticket = apps.get_model("tickets", "Ticket")
    for ticket in Ticket.objects.filter(qr_token=""):
        ticket.qr_token = hmac.new(
            settings.SECRET_KEY.encode(),
            str(ticket.id).encode(),
            hashlib.sha256,
        ).hexdigest()
        ticket.save(update_fields=["qr_token"])


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0003_ticket_checkin"),
    ]

    operations = [
        migrations.AddField(
            model_name="ticket",
            name="qr_token",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.RunPython(generate_qr_tokens, migrations.RunPython.noop),
        # Add unique constraint and index separately so we can handle pre-existing state
        migrations.AlterField(
            model_name="ticket",
            name="qr_token",
            field=models.CharField(blank=True, max_length=64, unique=True),
        ),
    ]
