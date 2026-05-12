from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="ticket_types",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
