"""
AI Engine service — wraps OpenAI API calls with graceful error handling.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

MIN_COMPARABLE_EVENTS = 3


def _get_openai_client():
    try:
        from openai import OpenAI
        api_key = getattr(settings, "OPENAI_API_KEY", "")
        if not api_key:
            return None
        return OpenAI(api_key=api_key)
    except Exception as exc:
        logger.error("Failed to initialise OpenAI client: %s", exc)
        return None


def _call_llm(prompt: str, system: str = None) -> dict:
    client = _get_openai_client()
    if client is None:
        return {"available": False, "reason": "AI service temporarily unavailable"}
    try:
        import json
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system or "You are an event planning assistant. Always respond with valid JSON only, no markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as exc:
        logger.error("OpenAI API call failed: %s", exc)
        return {"available": False, "reason": "AI service temporarily unavailable"}


def get_comparable_events(event):
    from apps.events.models import Event
    return Event.objects.filter(
        type=event.type,
        status="active",
        date__lt=timezone.now(),
    ).exclude(pk=event.pk)


def build_suggestions_prompt(event, comparable_events) -> str:
    history = []
    for ev in comparable_events[:10]:
        confirmed = ev.ticket_set.filter(status="confirmed").count()
        history.append({
            "name": ev.name,
            "date": ev.date.isoformat(),
            "capacity": ev.capacity,
            "confirmed": confirmed,
            "venue": ev.venue,
        })
    return (
        f"Based on the following historical {event.type} events:\n{history}\n\n"
        f"Suggest an optimal date/time and capacity for a new event named '{event.name}' "
        f"at venue '{event.venue}'. "
        "Return JSON with keys: suggested_date (ISO 8601), suggested_capacity (integer), reasoning (string)."
    )


def get_event_suggestions(event) -> dict:
    comparable = list(get_comparable_events(event))
    is_limited = len(comparable) < MIN_COMPARABLE_EVENTS

    if is_limited and len(comparable) == 0:
        suggested_date = (timezone.now() + timedelta(days=30)).isoformat()
        return {
            "available": True,
            "is_limited_data": True,
            "suggested_date": suggested_date,
            "suggested_capacity": event.capacity,
            "reasoning": "No historical data available for this event type.",
        }

    prompt = build_suggestions_prompt(event, comparable)
    result = _call_llm(prompt)
    if result.get("available") is not False:
        result["available"] = True
    result["is_limited_data"] = is_limited
    return result


def compute_registration_velocity(event) -> dict:
    from apps.tickets.models import Ticket
    now = timezone.now()
    window = timedelta(hours=24)

    current_count = Ticket.objects.filter(
        event=event, status="confirmed", registered_at__gte=now - window,
    ).count()

    comparable = list(get_comparable_events(event))
    is_limited = len(comparable) < MIN_COMPARABLE_EVENTS

    if not comparable:
        return {"velocity": current_count, "avg_velocity": 0, "ratio": None, "alert": False, "is_limited_data": True}

    velocities = []
    for ev in comparable:
        days_to_event = max((ev.date - ev.created_at).days, 1)
        total = Ticket.objects.filter(event=ev, status="confirmed").count()
        velocities.append(total / days_to_event)

    avg_velocity = sum(velocities) / len(velocities) if velocities else 0
    ratio = (current_count / avg_velocity) if avg_velocity > 0 else None
    alert = ratio is not None and ratio > 1.2

    return {
        "velocity": current_count,
        "avg_velocity": round(avg_velocity, 4),
        "ratio": round(ratio, 4) if ratio is not None else None,
        "alert": alert,
        "is_limited_data": is_limited,
    }


def get_smart_alert_message(event, available_seats: int) -> str:
    """
    Generate an AI-enriched alert message for a low-ticket situation.
    Falls back to a plain message if LLM is unavailable.
    """
    from apps.tickets.models import Ticket
    now = timezone.now()

    # Registration velocity in last 24h
    recent = Ticket.objects.filter(
        event=event, status="confirmed",
        registered_at__gte=now - timedelta(hours=24),
    ).count()

    days_until = max((event.date - now).days, 0)

    prompt = (
        f"Event: '{event.name}' ({event.type}) at '{event.venue}'\n"
        f"Date: {event.date.strftime('%Y-%m-%d %H:%M')} UTC ({days_until} days away)\n"
        f"Capacity: {event.capacity}, Available seats: {available_seats}\n"
        f"Registrations in last 24h: {recent}\n"
        f"Alert threshold: {event.alert_threshold}\n\n"
        "Write a concise, actionable alert message (1-2 sentences) for the event admin. "
        "Include urgency level and a specific recommendation. "
        "Return JSON with keys: message (string), urgency (low|medium|high|critical), recommendation (string)."
    )
    result = _call_llm(prompt)
    if result.get("available") is False:
        return {
            "message": f"Low ticket alert for '{event.name}': only {available_seats} seat(s) remaining (threshold: {event.alert_threshold}).",
            "urgency": "medium",
            "recommendation": "Consider promoting the event to fill remaining seats.",
        }
    return result


def get_weekly_summary() -> dict:
    from django.db.models import Count
    from django.db.models.functions import TruncDate
    from apps.events.models import Event
    from apps.tickets.models import Ticket

    now = timezone.now()
    week_ago = now - timedelta(weeks=1)

    new_registrations = Ticket.objects.filter(status="confirmed", registered_at__gte=week_ago).count()
    active_events = Event.objects.filter(status="active", date__gte=now).count()
    revenue = sum(
        t.event.price
        for t in Ticket.objects.filter(status="confirmed", registered_at__gte=week_ago).select_related("event")
    )

    daily = (
        Ticket.objects.filter(status="confirmed", registered_at__gte=week_ago)
        .annotate(day=TruncDate("registered_at"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    peak_day = str(daily[0]["day"]) if daily else None

    summary_data = {
        "period_start": week_ago.isoformat(),
        "period_end": now.isoformat(),
        "new_registrations": new_registrations,
        "active_events": active_events,
        "revenue": str(revenue),
        "peak_day": peak_day,
    }

    prompt = (
        f"Given this weekly event management summary: {summary_data}\n"
        "Provide a brief narrative insight (2-3 sentences) and a revenue forecast for next week. "
        "Return JSON with keys: narrative (string), revenue_forecast (number), key_insight (string), action_items (list of strings)."
    )
    llm_result = _call_llm(prompt)

    if llm_result.get("available") is False:
        summary_data.update({"narrative": None, "revenue_forecast": None, "key_insight": None, "action_items": []})
    else:
        summary_data.update({
            "narrative": llm_result.get("narrative"),
            "revenue_forecast": llm_result.get("revenue_forecast"),
            "key_insight": llm_result.get("key_insight"),
            "action_items": llm_result.get("action_items", []),
        })

    summary_data["available"] = True
    return summary_data


def get_dashboard_insights(admin_user) -> dict:
    """
    Generate a holistic AI dashboard briefing for the admin:
    - Overall health score
    - Top recommendations
    - Risk events
    - Opportunity events
    """
    from apps.events.models import Event
    from apps.tickets.models import Ticket

    now = timezone.now()
    events = list(Event.objects.filter(created_by=admin_user, status="active", date__gte=now).prefetch_related("ticket_set"))

    if not events:
        return {"available": True, "health_score": None, "summary": "No active events to analyse.", "recommendations": [], "risk_events": [], "opportunity_events": []}

    event_data = []
    for ev in events:
        confirmed = ev.ticket_set.filter(status="confirmed").count()
        available = ev.capacity - confirmed
        fill_pct = round((confirmed / ev.capacity) * 100, 1) if ev.capacity > 0 else 0
        days_until = max((ev.date - now).days, 0)
        recent_24h = Ticket.objects.filter(event=ev, status="confirmed", registered_at__gte=now - timedelta(hours=24)).count()
        event_data.append({
            "name": ev.name,
            "type": ev.type,
            "days_until": days_until,
            "capacity": ev.capacity,
            "confirmed": confirmed,
            "available": available,
            "fill_pct": fill_pct,
            "recent_24h_registrations": recent_24h,
            "alert_triggered": ev.alert_triggered,
        })

    prompt = (
        f"You are an AI assistant for an event management system. Analyse these active events:\n{event_data}\n\n"
        "Provide a smart dashboard briefing. Return JSON with:\n"
        "- health_score: integer 0-100 (overall portfolio health)\n"
        "- summary: string (1-2 sentence executive summary)\n"
        "- recommendations: list of objects {event_name, action, priority (high/medium/low)}\n"
        "- risk_events: list of event names that need immediate attention\n"
        "- opportunity_events: list of event names with strong momentum\n"
        "- mood: one of 'excellent'|'good'|'attention'|'critical'"
    )
    result = _call_llm(prompt, system="You are a smart event analytics AI. Always respond with valid JSON only.")
    if result.get("available") is False:
        return {
            "available": True,
            "health_score": None,
            "summary": "AI insights temporarily unavailable.",
            "recommendations": [],
            "risk_events": [],
            "opportunity_events": [],
            "mood": "good",
        }
    result["available"] = True
    return result

import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

MIN_COMPARABLE_EVENTS = 3


def _get_openai_client():
    """Return an OpenAI client, or None if the key is not configured."""
    try:
        from openai import OpenAI  # noqa: PLC0415

        api_key = getattr(settings, "OPENAI_API_KEY", "")
        if not api_key:
            return None
        return OpenAI(api_key=api_key)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to initialise OpenAI client: %s", exc)
        return None

