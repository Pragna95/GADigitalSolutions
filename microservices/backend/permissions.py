from rest_framework.permissions import BasePermission
from apps.meetings.models import Product

class IsCompanyUser(BasePermission):
    """
    Permission class that ensures the authenticated user is a Product/Company.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and isinstance(request.user, Product))
