from django.urls import path
from .views import AlertListView, AlertDismissView, AlertDismissAllView

urlpatterns = [
    path("", AlertListView.as_view(), name="alert-list"),
    path("dismiss-all/", AlertDismissAllView.as_view(), name="alert-dismiss-all"),
    path("<uuid:pk>/dismiss/", AlertDismissView.as_view(), name="alert-dismiss"),
]
