import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("auth_service", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="LoginAttempt",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("email", models.EmailField()),
                ("attempted_at", models.DateTimeField(auto_now_add=True)),
                ("success", models.BooleanField(default=False)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
            ],
            options={
                "app_label": "auth_service",
            },
        ),
    ]
