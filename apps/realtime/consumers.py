import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)

DASHBOARD_GROUP = "dashboard"


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add(DASHBOARD_GROUP, self.channel_name)
        await self.accept()
        logger.debug("WebSocket client connected: %s", self.channel_name)

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(DASHBOARD_GROUP, self.channel_name)
        logger.debug("WebSocket client disconnected: %s (code=%s)", self.channel_name, close_code)

    async def receive_json(self, content, **kwargs):
        # Clients are read-only; ignore any incoming messages
        pass

    # ── Group message handler ─────────────────────────────────────────────────
    async def event_update(self, event):
        """Receive a broadcast from the group and forward it to the WebSocket client."""
        await self.send_json(event["data"])


# ── Module-level helper callable from sync Django views ──────────────────────

@database_sync_to_async
def _fetch_event_stats(event_id):
    """Fetch current stats for an event. Returns None if not found."""
    from apps.events.models import Event  # local import to avoid circular deps
    try:
        ev = Event.objects.get(pk=event_id)
        confirmed = ev.ticket_set.filter(status="confirmed").count()
        return {
            "event_id": str(ev.id),
            "name": ev.name,
            "capacity": ev.capacity,
            "confirmed": confirmed,
            "available_seats": ev.capacity - confirmed,
            "status": ev.status,
            "alert_triggered": ev.alert_triggered,
        }
    except Event.DoesNotExist:
        return None


async def _broadcast_event_update(event_id):
    """Async helper: fetch stats and broadcast to the dashboard group."""
    from channels.layers import get_channel_layer
    stats = await _fetch_event_stats(event_id)
    if stats is None:
        return
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        DASHBOARD_GROUP,
        {"type": "event.update", "data": stats},
    )


def send_event_update(event_id):
    """
    Sync-safe entry point called from Django views/services.
    Uses asgiref's async_to_sync which correctly handles Daphne's thread pool.
    """
    from asgiref.sync import async_to_sync
    try:
        async_to_sync(_broadcast_event_update)(event_id)
    except Exception as exc:
        logger.warning("Failed to broadcast event update for %s: %s", event_id, exc)
