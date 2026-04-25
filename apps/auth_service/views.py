from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView as BaseTokenRefreshView

from apps.auth_service.models import User
from apps.auth_service.permissions import IsSuperAdmin
from apps.auth_service.rate_limit import get_retry_after, is_account_locked, record_attempt
from apps.auth_service.serializers import (
    LoginSerializer,
    LogoutSerializer,
    RegisterAdminSerializer,
    UserSerializer,
)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        ip = request.META.get("REMOTE_ADDR")

        if is_account_locked(email):
            retry_after = get_retry_after(email)
            return Response(
                {"detail": "Account locked", "retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = authenticate(request, username=email, password=password)

        if user is None:
            record_attempt(email, success=False, ip_address=ip)
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        record_attempt(email, success=True, ip_address=ip)
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


class TokenRefreshView(BaseTokenRefreshView):
    """Thin wrapper so we can mount it under our URL namespace."""
    pass


class LogoutView(APIView):
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        token_str = serializer.validated_data["refresh"]
        try:
            token = RefreshToken(token_str)
            token.blacklist()
        except TokenError:
            return Response(
                {"detail": "Token is invalid or expired"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"detail": "Logged out successfully"}, status=status.HTTP_200_OK)


class RegisterAdminView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        serializer = RegisterAdminSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        role = serializer.validated_data.get("role", "admin")

        if User.objects.filter(email=email).exists():
            return Response(
                {"detail": "A user with this email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(email=email, role=role)
        user.set_unusable_password()
        user.save()

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
        setup_link = f"{frontend_url}/setup-password?uid={uid}&token={token}"

        send_mail(
            subject="Set up your Event Management System account",
            message=f"You have been invited as an admin. Set up your password here:\n\n{setup_link}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=True,
        )

        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class AdminListView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        admins = User.objects.filter(role__in=["admin", "super_admin"]).order_by("date_joined")
        return Response(UserSerializer(admins, many=True).data)


class DeactivateAdminView(APIView):
    permission_classes = [IsSuperAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        user.is_active = False
        user.save()

        # Blacklist all outstanding refresh tokens for this user
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )

            outstanding = OutstandingToken.objects.filter(user=user)
            for token in outstanding:
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass  # blacklist app may not have tokens; proceed regardless

        return Response({"detail": "Admin deactivated"}, status=status.HTTP_200_OK)
