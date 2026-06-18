from rest_framework import serializers
from .models import ChatRoom, ChatMessage, Meeting
from django.contrib.auth import get_user_model

User = get_user_model()

class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'name']

class ChatMessageSerializer(serializers.ModelSerializer):
    sender = UserMinimalSerializer(read_only=True)
    sender_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='sender', write_only=True, required=False
    )

    class Meta:
        model = ChatMessage
        fields = ['id', 'room', 'sender', 'sender_id', 'content', 'timestamp']

class ChatRoomSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ['id', 'name', 'display_name', 'is_group', 'created_at', 'last_message']

    def get_last_message(self, obj):
        last_msg = obj.messages.order_by('-timestamp').first()
        if last_msg:
            return {
                'content': last_msg.content,
                'sender': last_msg.sender.name or last_msg.sender.username or last_msg.sender.email,
                'timestamp': last_msg.timestamp
            }
        return None

class MeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Meeting
        fields = [
            'id',
            'meeting_code',
            'title',
            'description',
            'datetime',
            'created_by_email',
            'created_by_name',
            'participants',
            'created_at'
        ]
        read_only_fields = ['id', 'meeting_code', 'created_at']

