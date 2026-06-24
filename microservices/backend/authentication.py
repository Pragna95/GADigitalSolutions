from rest_framework import authentication
from django.contrib.auth import get_user_model
from backend.jwt_utils import decode_jwt
from django.conf import settings
import random

class ApiKeyAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ")[1]
        payload = decode_jwt(token, settings.SECRET_KEY)
        if not payload:
            return None

        email = payload.get("email")
        if not email:
            return None

        UserModel = get_user_model()
        user = UserModel.objects.filter(email=email).first()
        if not user:
            username = payload.get("username") or email.split("@")[0]
            # Ensure unique username
            while UserModel.objects.filter(username=username).exists():
                username = f"{username}_{random.randint(1000, 9999)}"
            try:
                user = UserModel.objects.create(username=username, email=email)
            except Exception:
                user = UserModel.objects.filter(email=email).first()

        if user:
            return (user, token)

        return None
