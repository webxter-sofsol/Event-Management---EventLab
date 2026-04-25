from django.db.models import Q
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from apps.events.models import Event
from apps.events.serializers import EventSerializer
from apps.tickets.models import Guest
from apps.tickets.serializers import GuestSerializer


class EventSearchView(ListAPIView):
    """
    GET /api/search/events/
    Query params: q, date_from, date_to, venue, type, status
    """
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        params = self.request.query_params
        queryset = Event.objects.all().order_by("date")

        q = params.get("q")
        if q:
            queryset = queryset.filter(Q(name__icontains=q) | Q(venue__icontains=q))

        date_from = params.get("date_from")
        if date_from:
            queryset = queryset.filter(date__gte=date_from)

        date_to = params.get("date_to")
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        venue = params.get("venue")
        if venue:
            queryset = queryset.filter(venue=venue)

        event_type = params.get("type")
        if event_type:
            queryset = queryset.filter(type=event_type)

        status = params.get("status")
        if status:
            queryset = queryset.filter(status=status)

        return queryset


class GuestSearchView(ListAPIView):
    """
    GET /api/search/guests/
    Query params: q (searches name and email)
    """
    serializer_class = GuestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        q = self.request.query_params.get("q", "")
        if q:
            return Guest.objects.filter(
                Q(name__icontains=q) | Q(email__icontains=q)
            ).order_by("name")
        return Guest.objects.all().order_by("name")
