import os
import django

print("1. Setting env...")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

print("2. Setting up django...")
django.setup()
print("3. Django setup success!")

print("4. Importing cache...")
from django.core.cache import cache

print("5. Calling cache.set...")
try:
    cache.set("test_key", "test_val")
    print("6. Cache set success!")
except Exception as e:
    print(f"6. Cache set failed: {e}")

print("7. Calling cache.get...")
try:
    val = cache.get("test_key")
    print("8. Cache get success, value is:", val)
except Exception as e:
    print(f"8. Cache get failed: {e}")
