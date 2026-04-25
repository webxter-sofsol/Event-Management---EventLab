from django.urls import path

from .views import BulkRegistrationView, RegistrationDetailView, RegistrationListCreateView, RegistrationLogView

urlpatterns = [
    path("", RegistrationListCreateView.as_view(), name="registration-list-create"),
    path("bulk/", BulkRegistrationView.as_view(), name="registration-bulk"),
    path("log/", RegistrationLogView.as_view(), name="registration-log"),
    path("<uuid:ticket_pk>/", RegistrationDetailView.as_view(), name="registration-detail"),
]
