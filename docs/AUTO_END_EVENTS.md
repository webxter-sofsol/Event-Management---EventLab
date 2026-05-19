# Automatic Event Ending

Events can automatically end when they reach their `end_date`. This document explains how the feature works and how to set it up.

## How It Works

1. **End Date Field**: Events have an optional `end_date` field
2. **Automatic Cancellation**: Events are automatically marked as "cancelled" when their end date passes
3. **Two Methods**:
   - **Real-time**: Events are checked and updated when the event list is loaded
   - **Scheduled**: Run a management command periodically via cron/scheduler

## Setting End Dates

When creating or editing an event, you can optionally set an end date/time:
- The end date must be after the start date
- If no end date is set, the event won't automatically end
- End dates are in the same timezone as start dates

## Manual Command

Run this command to manually end all expired events:

```bash
python manage.py end_expired_events
```

## Automated Scheduling

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., every hour)
4. Action: Start a program
5. Program: `path\to\python.exe`
6. Arguments: `manage.py end_expired_events`
7. Start in: `D:\Projects\EventManagement\Final`

### Linux/Mac (Cron)

Add to crontab (`crontab -e`):

```cron
# Run every hour
0 * * * * cd /path/to/project && /path/to/venv/bin/python manage.py end_expired_events
```

## Real-time Checking

The system also checks for expired events automatically when:
- Event list is loaded (Dashboard, Browse Events, etc.)
- This ensures events are ended even without the scheduled task

## Notes

- Ended events have status changed to "cancelled"
- No cancellation emails are sent for auto-ended events
- Events without an end_date will never auto-end
