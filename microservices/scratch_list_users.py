import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth.models import User

print("All Django Auth Users in Microservice Database:")
for u in User.objects.all():
    print(f"  - Username: {u.username}, Email: {u.email}, Is Active: {u.is_active}, Is Staff: {u.is_staff}, Is Superuser: {u.is_superuser}")
