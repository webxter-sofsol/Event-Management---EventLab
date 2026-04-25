from django.urls import path

from apps.auth_service.views import (
    AdminListView,
    DeactivateAdminView,
    LoginView,
    LogoutView,
    RegisterAdminView,
    TokenRefreshView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("register-admin/", RegisterAdminView.as_view(), name="auth-register-admin"),
    path("admins/", AdminListView.as_view(), name="auth-admin-list"),
    path("admins/<uuid:pk>/deactivate/", DeactivateAdminView.as_view(), name="auth-deactivate-admin"),
]
