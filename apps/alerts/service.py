from django.conf import settings
from django.core.mail import send_mail

from apps.events.models import Event

from .models import Alert


def check_and_dispatch_alert(event_id):
    """
    Check available seats against the alert threshold and dispatch alerts if needed.

    - If available_seats < alert_threshold AND alert_triggered is False:
        * Set alert_triggered = True
        * Create an in-app Alert record
        * Send an email to the event's managing admin
    - If available_seats >= alert_threshold AND alert_triggered is True:
        * Reset alert_triggered = False (allows future crossings to trigger again)
    - If alert_triggered is already True and seats are still below threshold: skip (no duplicate)
    """
    try:
        event = Event.objects.select_related("created_by").get(pk=event_id)
    except Event.DoesNotExist:
        return

    available_seats = event.capacity - event.ticket_set.filter(status="confirmed").count()

    if available_seats < event.alert_threshold:
        if not event.alert_triggered:
            event.alert_triggered = True
            event.save(update_fields=["alert_triggered"])

            # Get AI-enriched alert message
            from apps.ai_engine.service import get_smart_alert_message
            ai_alert = get_smart_alert_message(event, available_seats)
            message = ai_alert.get("message", f"Low ticket alert for '{event.name}': only {available_seats} seat(s) remaining.")
            urgency = ai_alert.get("urgency", "medium")
            recommendation = ai_alert.get("recommendation", "")

            full_message = message
            if recommendation:
                full_message = f"{message} Recommendation: {recommendation}"

            Alert.objects.create(event=event, message=full_message)

            if event.created_by and event.created_by.email:
                subject = f"[{urgency.upper()}] Low Ticket Alert: {event.name}"
                send_mail(
                    subject=subject,
                    message=full_message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[event.created_by.email],
                    fail_silently=True,
                )

            from apps.realtime.consumers import send_event_update
            send_event_update(event_id)
        # else: already triggered — skip duplicate
    else:
        # Seats are at or above threshold — reset so future crossings can trigger again
        if event.alert_triggered:
            event.alert_triggered = False
            event.save(update_fields=["alert_triggered"])
