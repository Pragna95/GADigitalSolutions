from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model

class EmailOrUsernameModelBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        
        if not username:
            return None

        # Try to fetch by email first if username contains '@'
        if '@' in username:
            try:
                user = UserModel.objects.get(email=username)
                if user.check_password(password):
                    return user
            except UserModel.DoesNotExist:
                pass
        
        # Fallback to standard username authentication
        try:
            user = UserModel.objects.get(**{UserModel.USERNAME_FIELD: username})
            if user.check_password(password):
                return user
        except UserModel.DoesNotExist:
            return None
