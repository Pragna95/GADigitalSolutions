from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .meeting_state import state_manager

class MeetingParticipantsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, meeting_id):
        participants = state_manager.get_participants(meeting_id)
        return Response(list(participants.values()), status=status.HTTP_200_OK)

class MeetingParticipantDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, meeting_id, user_id):
        participant = state_manager.get_participant(meeting_id, user_id)
        if not participant:
            return Response({"detail": "Participant not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(participant, status=status.HTTP_200_OK)

class MeetingParticipantUpdateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        meeting_id = request.data.get("meeting_id")
        user_id = request.data.get("user_id")
        name = request.data.get("name")
        is_mic_on = request.data.get("is_mic_on")
        is_video_on = request.data.get("is_video_on")
        hand_raised = request.data.get("hand_raised")

        if not meeting_id or not user_id:
            return Response({"detail": "meeting_id and user_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        updated_part = state_manager.update_participant(
            meeting_id, user_id, name,
            is_mic_on=is_mic_on, is_video_on=is_video_on, hand_raised=hand_raised
        )
        return Response(updated_part, status=status.HTTP_200_OK)

class StartScreenShareView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        meeting_link = request.data.get("meeting_link")
        user_id = request.data.get("user_id")
        name = request.data.get("name", "")

        if not meeting_link or not user_id:
            return Response({"detail": "meeting_link and user_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        state_manager.start_screen_share(meeting_link, user_id, name)
        return Response({"status": "screen share started"}, status=status.HTTP_200_OK)

class StopScreenShareView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        meeting_link = request.data.get("meeting_link")
        user_id = request.data.get("user_id")

        if not meeting_link:
            return Response({"detail": "meeting_link is required"}, status=status.HTTP_400_BAD_REQUEST)

        state_manager.stop_screen_share(meeting_link)
        return Response({"status": "screen share stopped"}, status=status.HTTP_200_OK)

class CurrentScreenSharerView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, meeting_link):
        sharer = state_manager.get_screen_sharer(meeting_link)
        return Response({"screenSharer": sharer}, status=status.HTTP_200_OK)
