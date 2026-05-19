"""
Management command to automatically end events that have passed their end_date.
Run this periodically via cron job or task scheduler.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.events.models import Event


class Command(BaseCommand):
    help = 'Automatically cancel events that have passed their end_date'

    def handle(self, *args, **options):
        now = timezone.now()
        
        # Find active events that have passed their end date
        expired_events = Event.objects.filter(
            status='active',
            end_date__isnull=False,
            end_date__lte=now
        )
        
        count = expired_events.count()
        
        if count == 0:
            self.stdout.write(self.style.SUCCESS('No expired events found.'))
            return
        
        # Update status to cancelled
        expired_events.update(status='cancelled')
        
        self.stdout.write(
            self.style.SUCCESS(f'Successfully ended {count} event(s).')
        )
        
        # Log the events that were ended
        for event in expired_events:
            self.stdout.write(f'  - {event.name} (ended at {event.end_date})')
