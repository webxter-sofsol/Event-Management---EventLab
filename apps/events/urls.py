from django.urls import include, path

from apps.ai_engine.views import AISuggestionsView, AIVelocityAlertView
from apps.tickets.views_public import PublicTicketPurchaseView

from .views import AlertThresholdView, EventDetailView, EventListCreateView, EventQRCodeView, EventStatsView

urlpatterns = [
    path("", EventListCreateView.as_view(), name="event-list-create"),
    path("<uuid:pk>/", EventDetailView.as_view(), name="event-detail"),
    path("<uuid:pk>/stats/", EventStatsView.as_view(), name="event-stats"),
    path("<uuid:pk>/qr/", EventQRCodeView.as_view(), name="event-qr"),
    path("<uuid:pk>/alert-threshold/", AlertThresholdView.as_view(), name="event-alert-threshold"),
    path("<uuid:event_pk>/purchase/", PublicTicketPurchaseView.as_view(), name="event-purchase"),
    path("<uuid:event_pk>/registrations/", include("apps.tickets.urls")),
    path("<uuid:pk>/report/", include("apps.reports.urls")),
    path("<uuid:pk>/ai/suggestions/", AISuggestionsView.as_view(), name="event-ai-suggestions"),
    path("<uuid:pk>/ai/velocity-alert/", AIVelocityAlertView.as_view(), name="event-ai-velocity-alert"),
]
