from django.urls import path
from .views import AIWeeklySummaryView, AIDashboardInsightsView

urlpatterns = [
    path("weekly-summary/", AIWeeklySummaryView.as_view(), name="ai-weekly-summary"),
    path("dashboard-insights/", AIDashboardInsightsView.as_view(), name="ai-dashboard-insights"),
]
