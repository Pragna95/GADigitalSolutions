from rest_framework import generics, permissions
from .models import ChatRoom, ChatMessage
from .serializers import ChatRoomSerializer, ChatMessageSerializer
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

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
