import os
import django
from rest_framework.test import APIRequestFactory

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.meetings.models import Product, User, Meeting
from apps.meetings.MeetingViews import ListMeetingsView

# Create a test product if it doesn't exist
product, _ = Product.objects.get_or_create(
    name="Test Product",
    slug="test-product",
    defaults={"status": "active"}
)

# Create a test host user if it doesn't exist
host_user, _ = User.objects.get_or_create(
    email="test_host@demo.com",
    defaults={
        "product": product,
        "external_user_id": "test_host_123",
        "name": "Test Host",
        "role": "host"
    }
)

# Create test meetings
meeting1 = Meeting.objects.create(
    product=product,
    created_by_user=host_user,
    title="Instant Huddle",
    meeting_code="aaa-bbbb-ccc",
    status="scheduled"
)
meeting2 = Meeting.objects.create(
    product=product,
    created_by_user=host_user,
    title="Instant Huddle",
    meeting_code="ddd-eeee-fff",
    status="scheduled"
)

print(f"Created two meetings: {meeting1.id} and {meeting2.id}")
print(f"Total meetings count in DB: {Meeting.objects.count()}")

# Create request using rest_framework's APIRequestFactory
factory = APIRequestFactory()
request = factory.delete('/api/meetings/', {'meeting_ids': [str(meeting1.id), str(meeting2.id)]}, format='json')

# Resolve view
view = ListMeetingsView.as_view()
response = view(request)

print(f"Response status: {response.status_code}")
print(f"Response data: {response.data}")
print(f"Total meetings count in DB after bulk delete: {Meeting.objects.count()}")

# Clean up any remaining test items
Meeting.objects.filter(product=product).delete()
