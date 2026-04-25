from django.urls import path

from .views import EventReportExportView, EventReportView

urlpatterns = [
    path("", EventReportView.as_view(), name="event-report"),
    path("export/", EventReportExportView.as_view(), name="event-report-export"),
]
