from django.db import models
from django.conf import settings

class ChatRoom(models.Model):
    name = models.CharField(max_length=255, unique=True)
    display_name = models.CharField(max_length=255, blank=True)
    is_group = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.display_name or self.name

class ChatMessage(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_messages')
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender.email} in {self.room.name}: {self.content[:30]}"
