from django.db import migrations


def populate_ticket_types(apps, schema_editor):
    """Populate ticket_types for existing events that don't have it set."""
    Event = apps.get_model("events", "Event")
    for event in Event.objects.all():
        if not event.ticket_types or len(event.ticket_types) == 0:
            # Use the existing price field as the 'normal' ticket price
            event.ticket_types = {"normal": float(event.price)}
            event.save(update_fields=["ticket_types"])


def reverse_populate(apps, schema_editor):
    """Reverse migration - clear ticket_types."""
    Event = apps.get_model("events", "Event")
    Event.objects.all().update(ticket_types={})


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0002_event_available_ticket_types"),
    ]

    operations = [
        migrations.RunPython(populate_ticket_types, reverse_populate),
    ]
