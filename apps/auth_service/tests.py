"""
Auth service unit tests.
Covers: User model, LoginAttempt/rate-limiting, login view, token refresh,
logout, register-admin, deactivate-admin, and permission classes.
"""

import uuid
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_service.models import LoginAttempt, User
from apps.auth_service.permissions import IsAdmin, IsSuperAdmin
from apps.auth_service.rate_limit import get_retry_after, is_account_locked, record_attempt


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_user(email="user@example.com", role="admin", password="TestPass123!", **kwargs):
    return User.objects.create_user(email=email, password=password, role=role, **kwargs)


def make_super_admin(email="super@example.com", password="SuperPass123!"):
    return User.objects.create_user(email=email, password=password, role="super_admin")


def auth_client(user):
    """Return an APIClient authenticated as *user*."""
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


# ─── User model ───────────────────────────────────────────────────────────────

class UserModelTests(TestCase):
    def test_create_user_sets_email_and_role(self):
        user = make_user(email="a@example.com", role="admin")
        self.assertEqual(user.email, "a@example.com")
        self.assertEqual(user.role, "admin")

    def test_user_pk_is_uuid(self):
        user = make_user(email="b@example.com")
        self.assertIsInstance(user.id, uuid.UUID)

    def test_user_is_active_by_default(self):
        user = make_user(email="c@example.com")
        self.assertTrue(user.is_active)

    def test_date_joined_is_set(self):
        user = make_user(email="d@example.com")
        self.assertIsNotNone(user.date_joined)

    def test_create_user_requires_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password="pass")

    def test_password_is_hashed(self):
        user = make_user(email="e@example.com", password="plaintext")
        self.assertNotEqual(user.password, "plaintext")
        self.assertTrue(user.check_password("plaintext"))

    def test_create_superuser_sets_role(self):
        su = User.objects.create_superuser(email="su@example.com", password="pass")
        self.assertEqual(su.role, "super_admin")
        self.assertTrue(su.is_staff)
        self.assertTrue(su.is_superuser)

    def test_str_returns_email(self):
        user = make_user(email="str@example.com")
        self.assertEqual(str(user), "str@example.com")


# ─── LoginAttempt model ───────────────────────────────────────────────────────

class LoginAttemptModelTests(TestCase):
    def test_record_attempt_creates_row(self):
        record_attempt("x@example.com", success=False, ip_address="127.0.0.1")
        self.assertEqual(LoginAttempt.objects.filter(email="x@example.com").count(), 1)

    def test_record_attempt_success_flag(self):
        record_attempt("y@example.com", success=True)
        attempt = LoginAttempt.objects.get(email="y@example.com")
        self.assertTrue(attempt.success)

    def test_login_attempt_pk_is_uuid(self):
        record_attempt("z@example.com", success=False)
        attempt = LoginAttempt.objects.get(email="z@example.com")
        self.assertIsInstance(attempt.id, uuid.UUID)


# ─── Rate-limiting logic ──────────────────────────────────────────────────────

class RateLimitTests(TestCase):
    EMAIL = "ratelimit@example.com"

    def _fail(self, n=1):
        for _ in range(n):
            record_attempt(self.EMAIL, success=False)

    def test_not_locked_initially(self):
        self.assertFalse(is_account_locked(self.EMAIL))

    def test_locked_after_5_failures(self):
        self._fail(5)
        self.assertTrue(is_account_locked(self.EMAIL))

    def test_not_locked_after_4_failures(self):
        self._fail(4)
        self.assertFalse(is_account_locked(self.EMAIL))

    def test_success_does_not_count_toward_lockout(self):
        self._fail(4)
        record_attempt(self.EMAIL, success=True)
        self.assertFalse(is_account_locked(self.EMAIL))

    def test_old_failures_outside_window_ignored(self):
        """Failures older than 15 minutes should not count."""
        old_time = timezone.now() - timedelta(minutes=20)
        for _ in range(5):
            attempt = LoginAttempt.objects.create(
                email=self.EMAIL, success=False, ip_address=None
            )
            # Manually backdate
            LoginAttempt.objects.filter(pk=attempt.pk).update(attempted_at=old_time)
        self.assertFalse(is_account_locked(self.EMAIL))

    def test_get_retry_after_returns_positive_when_locked(self):
        self._fail(5)
        retry = get_retry_after(self.EMAIL)
        self.assertGreater(retry, 0)

    def test_get_retry_after_returns_zero_when_not_locked(self):
        retry = get_retry_after(self.EMAIL)
        self.assertEqual(retry, 0)


# ─── Login view ───────────────────────────────────────────────────────────────

class LoginViewTests(TestCase):
    URL = "/api/auth/login/"

    def setUp(self):
        self.client = APIClient()
        self.user = make_user(email="login@example.com", password="GoodPass123!")

    def test_valid_credentials_return_200_and_tokens(self):
        resp = self.client.post(self.URL, {"email": "login@example.com", "password": "GoodPass123!"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)

    def test_invalid_password_returns_401(self):
        resp = self.client.post(self.URL, {"email": "login@example.com", "password": "wrong"})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unknown_email_returns_401(self):
        resp = self.client.post(self.URL, {"email": "nobody@example.com", "password": "pass"})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_fields_returns_400(self):
        resp = self.client.post(self.URL, {"email": "login@example.com"})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_failed_attempts_are_recorded(self):
        self.client.post(self.URL, {"email": "login@example.com", "password": "bad"})
        self.assertEqual(
            LoginAttempt.objects.filter(email="login@example.com", success=False).count(), 1
        )

    def test_successful_login_records_success_attempt(self):
        self.client.post(self.URL, {"email": "login@example.com", "password": "GoodPass123!"})
        self.assertEqual(
            LoginAttempt.objects.filter(email="login@example.com", success=True).count(), 1
        )

    def test_locked_account_returns_429(self):
        for _ in range(5):
            record_attempt("login@example.com", success=False)
        resp = self.client.post(self.URL, {"email": "login@example.com", "password": "GoodPass123!"})
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("retry_after", resp.data)

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        resp = self.client.post(self.URL, {"email": "login@example.com", "password": "GoodPass123!"})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── Token refresh view ───────────────────────────────────────────────────────

class TokenRefreshViewTests(TestCase):
    URL = "/api/auth/token/refresh/"

    def setUp(self):
        self.client = APIClient()
        self.user = make_user(email="refresh@example.com", password="Pass123!")

    def _get_refresh_token(self):
        resp = self.client.post(
            "/api/auth/login/",
            {"email": "refresh@example.com", "password": "Pass123!"},
        )
        return resp.data["refresh"]

    def test_valid_refresh_returns_new_access_token(self):
        refresh = self._get_refresh_token()
        resp = self.client.post(self.URL, {"refresh": refresh})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)

    def test_invalid_refresh_token_returns_401(self):
        resp = self.client.post(self.URL, {"refresh": "not.a.valid.token"})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_refresh_field_returns_400(self):
        resp = self.client.post(self.URL, {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ─── Logout view ─────────────────────────────────────────────────────────────

class LogoutViewTests(TestCase):
    URL = "/api/auth/logout/"

    def setUp(self):
        self.user = make_user(email="logout@example.com", password="Pass123!")
        self.api_client = auth_client(self.user)

    def _get_refresh_token(self):
        resp = APIClient().post(
            "/api/auth/login/",
            {"email": "logout@example.com", "password": "Pass123!"},
        )
        return resp.data["refresh"]

    def test_logout_with_valid_token_returns_200(self):
        refresh = self._get_refresh_token()
        resp = self.api_client.post(self.URL, {"refresh": refresh})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_logout_blacklists_refresh_token(self):
        refresh = self._get_refresh_token()
        self.api_client.post(self.URL, {"refresh": refresh})
        # Using the same refresh token again should fail
        resp = APIClient().post("/api/auth/token/refresh/", {"refresh": refresh})
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST])

    def test_logout_with_invalid_token_returns_400(self):
        resp = self.api_client.post(self.URL, {"refresh": "invalid.token.here"})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_requires_authentication(self):
        refresh = self._get_refresh_token()
        resp = APIClient().post(self.URL, {"refresh": refresh})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_missing_refresh_field_returns_400(self):
        resp = self.api_client.post(self.URL, {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ─── Register admin view ──────────────────────────────────────────────────────

class RegisterAdminViewTests(TestCase):
    URL = "/api/auth/register-admin/"

    def setUp(self):
        self.super_admin = make_super_admin()
        self.admin = make_user(email="admin@example.com", role="admin")
        self.super_client = auth_client(self.super_admin)
        self.admin_client = auth_client(self.admin)

    @patch("apps.auth_service.views.send_mail")
    def test_super_admin_can_create_admin(self, mock_mail):
        resp = self.super_client.post(self.URL, {"email": "new@example.com", "role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email="new@example.com").exists())

    @patch("apps.auth_service.views.send_mail")
    def test_created_admin_has_correct_role(self, mock_mail):
        self.super_client.post(self.URL, {"email": "newadmin@example.com", "role": "admin"})
        user = User.objects.get(email="newadmin@example.com")
        self.assertEqual(user.role, "admin")

    @patch("apps.auth_service.views.send_mail")
    def test_register_admin_sends_email(self, mock_mail):
        self.super_client.post(self.URL, {"email": "email@example.com", "role": "admin"})
        mock_mail.assert_called_once()

    def test_regular_admin_cannot_register_admin(self):
        resp = self.admin_client.post(self.URL, {"email": "x@example.com", "role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_register_admin(self):
        resp = APIClient().post(self.URL, {"email": "x@example.com", "role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("apps.auth_service.views.send_mail")
    def test_duplicate_email_returns_400(self, mock_mail):
        self.super_client.post(self.URL, {"email": "dup@example.com", "role": "admin"})
        resp = self.super_client.post(self.URL, {"email": "dup@example.com", "role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_email_returns_400(self):
        resp = self.super_client.post(self.URL, {"role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("apps.auth_service.views.send_mail")
    def test_response_contains_user_fields(self, mock_mail):
        resp = self.super_client.post(self.URL, {"email": "fields@example.com", "role": "admin"})
        for field in ("id", "email", "role", "is_active", "date_joined"):
            self.assertIn(field, resp.data)


# ─── Deactivate admin view ────────────────────────────────────────────────────

class DeactivateAdminViewTests(TestCase):
    def setUp(self):
        self.super_admin = make_super_admin()
        self.admin = make_user(email="todeactivate@example.com", role="admin")
        self.other_admin = make_user(email="other@example.com", role="admin")
        self.super_client = auth_client(self.super_admin)
        self.admin_client = auth_client(self.other_admin)

    def _url(self, pk):
        return f"/api/auth/admins/{pk}/deactivate/"

    def test_super_admin_can_deactivate_admin(self):
        resp = self.super_client.patch(self._url(self.admin.pk))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_active)

    def test_regular_admin_cannot_deactivate(self):
        resp = self.admin_client.patch(self._url(self.admin.pk))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_deactivate(self):
        resp = APIClient().patch(self._url(self.admin.pk))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deactivate_nonexistent_user_returns_404(self):
        fake_pk = uuid.uuid4()
        resp = self.super_client.patch(self._url(fake_pk))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_deactivate_response_contains_detail(self):
        resp = self.super_client.patch(self._url(self.admin.pk))
        self.assertIn("detail", resp.data)


# ─── Permission classes ───────────────────────────────────────────────────────

class PermissionClassTests(TestCase):
    """Unit-test the permission classes directly via the API."""

    def setUp(self):
        self.super_admin = make_super_admin(email="perm_super@example.com")
        self.admin = make_user(email="perm_admin@example.com", role="admin")

    def test_is_super_admin_allows_super_admin(self):
        client = auth_client(self.super_admin)
        # register-admin endpoint uses IsSuperAdmin
        with patch("apps.auth_service.views.send_mail"):
            resp = client.post("/api/auth/register-admin/", {"email": "t@t.com", "role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_is_super_admin_blocks_regular_admin(self):
        client = auth_client(self.admin)
        resp = client.post("/api/auth/register-admin/", {"email": "t@t.com", "role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_is_super_admin_blocks_unauthenticated(self):
        resp = APIClient().post("/api/auth/register-admin/", {"email": "t@t.com", "role": "admin"})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
