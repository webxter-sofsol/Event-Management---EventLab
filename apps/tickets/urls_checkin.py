from django.urls import path
from .views_checkin import CheckInView, EventSelfCheckInView

urlpatterns = [
    path("", CheckInView.as_view(), name="checkin"),
    path("event/<uuid:event_pk>/", EventSelfCheckInView.as_view(), name="event-self-checkin"),
]
