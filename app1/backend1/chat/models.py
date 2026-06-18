from django.db import models
from django.conf import settings
import uuid

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

def generate_meeting_id():
    return str(uuid.uuid4().hex)

class Meeting(models.Model):
    id = models.CharField(max_length=255, primary_key=True, default=generate_meeting_id)
    meeting_code = models.CharField(max_length=50, unique=True, blank=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    datetime = models.DateTimeField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_meetings',
        null=True,
        blank=True
    )
    created_by_email = models.EmailField(blank=True, default='')
    created_by_name = models.CharField(max_length=255, blank=True, default='')
    participants = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.meeting_code:
            import random
            import string
            part1 = ''.join(random.choices(string.ascii_lowercase, k=3))
            part2 = ''.join(random.choices(string.ascii_lowercase, k=4))
            part3 = ''.join(random.choices(string.ascii_lowercase, k=3))
            self.meeting_code = f"{part1}-{part2}-{part3}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} ({self.meeting_code})"

