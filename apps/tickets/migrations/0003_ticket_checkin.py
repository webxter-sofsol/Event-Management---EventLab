from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0002_ticket_ticket_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="ticket",
            name="checked_in",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="ticket",
            name="checked_in_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
