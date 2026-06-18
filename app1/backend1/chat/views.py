from rest_framework import generics, permissions
from .models import ChatRoom, ChatMessage, Meeting
from .serializers import ChatRoomSerializer, ChatMessageSerializer, MeetingSerializer
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from django.contrib.auth import get_user_model

class ChatRoomListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Seed default rooms if none exist
        if ChatRoom.objects.count() == 0:
            default_channels = [
                {"name": "general", "display_name": "General", "is_group": True},
                {"name": "ux-ui-team", "display_name": "UX & UI Team", "is_group": True},
                {"name": "meme", "display_name": "Meme", "is_group": True},
            ]
            default_chats = [
                {"name": "ga-domes", "display_name": "GA Domes", "is_group": True},
                {"name": "sky-towers", "display_name": "Sky Towers", "is_group": True},
                {"name": "forest-retreat", "display_name": "Forest Retreat", "is_group": True},
                {"name": "mountain-peaks", "display_name": "Mountain Peaks", "is_group": True},
                {"name": "urban-jungle", "display_name": "Urban Jungle", "is_group": True},
            ]
            for room in default_channels + default_chats:
                ChatRoom.objects.get_or_create(
                    name=room["name"],
                    defaults={"display_name": room["display_name"], "is_group": room["is_group"]}
                )
        return ChatRoom.objects.all().order_by('id')

    def perform_create(self, serializer):
        serializer.save()

class ChatMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        room_id = self.kwargs.get('room_id')
        return ChatMessage.objects.filter(room_id=room_id).order_by('timestamp')

    def perform_create(self, serializer):
        room_id = self.kwargs.get('room_id')
        room = ChatRoom.objects.get(id=room_id)
        serializer.save(room=room, sender=self.request.user)

class MeetingScheduleView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email', '')
        name = request.data.get('name', '')
        title = request.data.get('title', '')
        description = request.data.get('description', '')
        datetime_val = request.data.get('datetime', '')
        participant_emails = request.data.get('participant_emails', [])

        if not title:
            return Response({"error": "Title is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not datetime_val:
            return Response({"error": "Datetime is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Find user object if possible
        User = get_user_model()
        creator = User.objects.filter(email=email).first()

        meeting = Meeting.objects.create(
            title=title,
            description=description,
            datetime=datetime_val,
            created_by=creator,
            created_by_email=email,
            created_by_name=name,
            participants=participant_emails
        )

        return Response({
            "meeting_code": meeting.meeting_code,
            "meeting_id": meeting.id,
            "title": meeting.title,
            "description": meeting.description,
            "datetime": meeting.datetime.isoformat() if hasattr(meeting.datetime, 'isoformat') else meeting.datetime,
            "participants": meeting.participants
        }, status=status.HTTP_201_CREATED)

class MeetingListView(generics.ListAPIView):
    serializer_class = MeetingSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        user = self.request.user
        email = None
        
        # Check API key from header
        api_key = self.request.META.get('HTTP_X_API_KEY')
        if not api_key:
            api_key = self.request.headers.get('x-api-key')
            
        if user and user.is_authenticated:
            email = user.email
        
        if not email and api_key:
            User = get_user_model()
            demo_user = User.objects.filter(username='demo').first() or User.objects.first()
            if demo_user:
                email = demo_user.email

        if not email:
            email = 'demo@example.com'

        all_meetings = Meeting.objects.all()
        user_meetings = []
        for m in all_meetings:
            is_creator = m.created_by_email and m.created_by_email.lower() == email.lower()
            is_participant = False
            if m.participants and isinstance(m.participants, list):
                is_participant = any(p.lower() == email.lower() for p in m.participants)
            if is_creator or is_participant:
                user_meetings.append(m)
                
        user_meetings.sort(key=lambda x: x.datetime)
        return user_meetings

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

class MeetingValidateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, meeting_code=None, meeting_id=None, company=None, api_key=None):
        meeting = None
        if meeting_id:
            meeting = Meeting.objects.filter(id=meeting_id).first()
            if not meeting and meeting_code:
                meeting = Meeting.objects.filter(meeting_code=meeting_code).first()
        elif meeting_code:
            meeting = Meeting.objects.filter(meeting_code=meeting_code).first()

        if not meeting:
            return Response({"detail": "Meeting not found", "valid": False}, status=status.HTTP_404_NOT_FOUND)

        company_name = company or "Huddle"

        return Response({
            "valid": True,
            "id": meeting.id,
            "meeting_code": meeting.meeting_code,
            "title": meeting.title,
            "description": meeting.description,
            "datetime": meeting.datetime.isoformat() if hasattr(meeting.datetime, 'isoformat') else meeting.datetime,
            "participants": meeting.participants,
            "company_name": company_name,
            "created_by_email": meeting.created_by_email,
            "created_by_name": meeting.created_by_name
        }, status=status.HTTP_200_OK)

class MeetingValidateLobbyView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, meeting_id):
        meeting = Meeting.objects.filter(id=meeting_id).first()
        if not meeting:
            meeting = Meeting.objects.filter(meeting_code=meeting_id).first()

        if not meeting:
            return Response({"detail": "Meeting not found", "valid": False}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "valid": True,
            "id": meeting.id,
            "meeting_code": meeting.meeting_code,
            "title": meeting.title,
            "description": meeting.description,
            "datetime": meeting.datetime.isoformat() if hasattr(meeting.datetime, 'isoformat') else meeting.datetime,
            "participants": meeting.participants,
            "company_name": "Huddle",
            "created_by_email": meeting.created_by_email,
            "created_by_name": meeting.created_by_name
        }, status=status.HTTP_200_OK)

