# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0003_populate_ticket_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='is_premium',
            field=models.BooleanField(default=False),
        ),
    ]
