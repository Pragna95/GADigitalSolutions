import jwt
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
# pyrefly: ignore [missing-import]
from apps.meetings.models import Product, Meeting, User
# pyrefly: ignore [missing-import]
from apps.meetings.livekit_utils import generate_join_token

class LiveKitUnitTests(APITestCase):

    def setUp(self):
        # Create a test product
        self.product = Product.objects.create(
            name="Test Product",
            slug="test-product",
            status="active"
        )
        # Create a test host user
        self.host_user = User.objects.create(
            product=self.product,
            external_user_id="host_123",
            email="host@test.com",
            name="Test Host",
            role="host"
        )
        # Create a test meeting
        self.meeting = Meeting.objects.create(
            product=self.product,
            created_by_user=self.host_user,
            title="Test Voice Huddle",
            meeting_code="abc-defg-hij",
            status="scheduled",
            timezone="Asia/Kolkata"
        )

    def test_token_generation_grants(self):
        """
        Verify generated token payloads match the user role permissions.
        """
        room_name = "test-room"
        identity = "user_abc"
        
        # Test host role
        token_host = generate_join_token(room_name, identity, role="host")
        decoded_host = jwt.decode(token_host, "secret", algorithms=["HS256"])
        self.assertEqual(decoded_host["iss"], "devkey")
        self.assertEqual(decoded_host["sub"], identity)
        self.assertTrue(decoded_host["video"]["roomJoin"])
        self.assertTrue(decoded_host["video"]["canPublish"])
        self.assertTrue(decoded_host["video"]["roomAdmin"])

        # Test listener role
        token_listener = generate_join_token(room_name, identity, role="listener")
        decoded_listener = jwt.decode(token_listener, "secret", algorithms=["HS256"])
        self.assertTrue(decoded_listener["video"]["roomJoin"])
        self.assertFalse(decoded_listener["video"]["canPublish"])
        self.assertNotIn("roomAdmin", decoded_listener["video"])

    def test_token_generation_api(self):
        """
        Test that requesting a LiveKit join token returns valid payload structure.
        """
        url = reverse("api_livekit_token")
        data = {
            "meeting_id": str(self.meeting.id),
            "user_id": "participant_user_999",
            "name": "Alex Participant",
            "role": "listener"
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertIn("url", response.data)
        self.assertEqual(response.data["room"], self.meeting.meeting_code)
        
        # Verify the database auto-created the user under the correct product
        user_exists = User.objects.filter(external_user_id="participant_user_999").exists()
        self.assertTrue(user_exists)

    def test_moderation_api_validation(self):
        """
        Verify basic bad input validation on the moderation API endpoint.
        """
        url = reverse("api_livekit_moderate")
        # Send empty payload
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_delete_meetings(self):
        """
        Verify that multiple meetings can be deleted at once.
        """
        meeting2 = Meeting.objects.create(
            product=self.product,
            created_by_user=self.host_user,
            title="Second Voice Huddle",
            meeting_code="xyz-defg-hij",
            status="scheduled",
            timezone="Asia/Kolkata"
        )
        self.assertEqual(Meeting.objects.count(), 2)

        url = reverse("api_list_meetings")
        data = {
            "meeting_ids": [str(self.meeting.id), str(meeting2.id)]
        }
        response = self.client.delete(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("deleted successfully", response.data["message"])
        self.assertEqual(Meeting.objects.count(), 0)

    def test_bulk_delete_meetings_query_params(self):
        """
        Verify that multiple meetings can be deleted via query parameters.
        """
        meeting2 = Meeting.objects.create(
            product=self.product,
            created_by_user=self.host_user,
            title="Second Voice Huddle",
            meeting_code="xyz-defg-hij",
            status="scheduled",
            timezone="Asia/Kolkata"
        )
        self.assertEqual(Meeting.objects.count(), 2)

        url = reverse("api_list_meetings") + f"?meeting_ids={self.meeting.id},{meeting2.id}"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Meeting.objects.count(), 0)


from django.contrib.auth.hashers import make_password
# pyrefly: ignore [missing-import]
from apps.meetings.models import ProductApiKey

class ScheduleMeetingTests(APITestCase):

    def setUp(self):
        # Create a test product
        self.product = Product.objects.create(
            name="Test Product",
            slug="test-product",
            status="active"
        )
        # Create active api key
        self.api_key_str = "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8"
        self.api_key_hash = make_password(self.api_key_str)
        self.api_key_obj = ProductApiKey.objects.create(
            product=self.product,
            api_key_hash=self.api_key_hash,
            environment="development",
            is_active=True
        )

    def test_schedule_meeting_with_explicit_api_key(self):
        url = reverse("api_schedule_meeting")
        data = {
            "email": "host@test.com",
            "name": "Host User",
            "title": "Discussion",
            "description": "Project sync",
            "datetime": "2026-06-25T17:00:00Z",
            "participant_emails": ["participant@test.com"]
        }
        response = self.client.post(url, data, format="json", headers={"X-Api-Key": self.api_key_str})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("meeting_id", response.data)
        self.assertIn("meeting_code", response.data)
        
        # Verify meeting was created in DB
        meeting = Meeting.objects.get(id=response.data["meeting_id"])
        self.assertEqual(meeting.title, "Discussion")
        self.assertEqual(meeting.participants.count(), 1)

    def test_schedule_meeting_fallback_api_key(self):
        url = reverse("api_schedule_meeting")
        data = {
            "email": "host@test.com",
            "name": "Host User",
            "title": "Discussion Fallback",
            "description": "Project sync",
            "datetime": "2026-06-25T17:00:00Z",
            "participant_emails": ["participant@test.com"]
        }
        # Do NOT set X-Api-Key header to trigger fallback
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("meeting_id", response.data)
        
        # Verify meeting was created in DB
        meeting = Meeting.objects.get(id=response.data["meeting_id"])
        self.assertEqual(meeting.title, "Discussion Fallback")

    def test_build_meeting_path_deterministic(self):
        # Create a meeting
        meeting = Meeting.objects.create(
            product=self.product,
            created_by_user=User.objects.create(
                product=self.product,
                external_user_id="host_det",
                email="host_det@test.com",
                name="Det Host",
                role="host"
            ),
            title="Det Huddle",
            meeting_code="det-hudd-lee",
            status="scheduled",
            timezone="Asia/Kolkata"
        )
        # Import the build_meeting_path function
        from apps.meetings.MeetingViews import build_meeting_path
        
        # Build path multiple times, they should all be identical (including the letter)
        path1 = build_meeting_path(meeting, api_key=self.api_key_str)
        path2 = build_meeting_path(meeting, api_key=self.api_key_str)
        self.assertEqual(path1, path2)
        
        # Extract letter from path (format: /product_slug/letter/api_key/meeting_id)
        letter1 = path1.split("/")[2]
        
        # Create another meeting
        meeting2 = Meeting.objects.create(
            product=self.product,
            created_by_user=meeting.created_by_user,
            title="Det Huddle 2",
            meeting_code="det-hudd-le2",
            status="scheduled",
            timezone="Asia/Kolkata"
        )
        path3 = build_meeting_path(meeting2, api_key=self.api_key_str)
        letter2 = path3.split("/")[2]
        
        # Check that it's deterministic for the second meeting too
        self.assertEqual(build_meeting_path(meeting2, api_key=self.api_key_str), path3)

