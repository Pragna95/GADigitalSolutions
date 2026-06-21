import jwt
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from apps.meetings.models import Product, Meeting, User
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
