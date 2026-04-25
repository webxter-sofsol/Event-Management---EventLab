from django.urls import path

from .views import EventSearchView, GuestSearchView

urlpatterns = [
    path("events/", EventSearchView.as_view(), name="search-events"),
    path("guests/", GuestSearchView.as_view(), name="search-guests"),
]
