import uuid
from django.db import models

class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=50)
    webhook_url = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'

    def __str__(self):
        return self.name


class ProductApiKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='api_keys')
    api_key_hash = models.TextField()
    environment = models.CharField(max_length=50)
    rate_limit = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_api_keys'


class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='users')
    external_user_id = models.CharField(max_length=255)
    email = models.EmailField()
    name = models.CharField(max_length=255)
    avatar_url = models.TextField(blank=True, null=True)
    role = models.CharField(max_length=50)
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f"{self.name} ({self.email})"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='audit_logs')
    actor_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=255)
    resource_type = models.CharField(max_length=255)
    resource_id = models.UUIDField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'


class Meeting(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='meetings')
    created_by_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_meetings')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    meeting_code = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=50)
    scheduled_start = models.DateTimeField(null=True, blank=True)
    scheduled_end = models.DateTimeField(null=True, blank=True)
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_end = models.DateTimeField(null=True, blank=True)
    timezone = models.CharField(max_length=50)
    max_participants = models.IntegerField(default=100)
    is_recording_enabled = models.BooleanField(default=False)
    is_waiting_room_enabled = models.BooleanField(default=False)
    settings = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'meetings'

    def __str__(self):
        return self.title


class MeetingParticipant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='meeting_participations')
    role = models.CharField(max_length=50)
    invited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='invitations_sent')
    invitation_status = models.CharField(max_length=50)
    joined_once = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'meeting_participants'


class RecurrenceRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='recurrence_rules')
    recurrence_type = models.CharField(max_length=50)
    interval_value = models.IntegerField(default=1)
    weekdays = models.JSONField(default=list, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'recurrence_rules'


class MeetingSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='sessions')
    started_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='started_sessions')
    session_number = models.IntegerField()
    status = models.CharField(max_length=50)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    peak_participant_count = models.IntegerField(default=0)
    total_duration_seconds = models.IntegerField(default=0)
    recording_status = models.CharField(max_length=50, blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'meeting_sessions'


class ParticipantSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting_session = models.ForeignKey(MeetingSession, on_delete=models.CASCADE, related_name='participant_sessions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    joined_at = models.DateTimeField()
    left_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.IntegerField(default=0)
    reconnect_count = models.IntegerField(default=0)
    speaking_duration_seconds = models.IntegerField(default=0)
    screen_share_duration_seconds = models.IntegerField(default=0)
    network_avg_latency = models.FloatField(default=0.0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'participant_sessions'


class Recording(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting_session = models.ForeignKey(MeetingSession, on_delete=models.CASCADE, related_name='recordings', null=True, blank=True)
    meeting_link = models.URLField(blank=True, null=True)
    recording_type = models.CharField(max_length=50, default="VIDEO")
    storage_provider = models.CharField(max_length=50, default="LOCAL")
    file_path = models.TextField(blank=True, null=True)
    file_size_bytes = models.BigIntegerField(default=0)
    duration_seconds = models.IntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True, null=True)
    processing_status = models.CharField(max_length=50, default="STARTED")
    started_by = models.CharField(max_length=100, blank=True, null=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'recordings'

    def __str__(self):
        return f"Recording {self.id} - {self.processing_status}"


class Transcript(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting_session = models.ForeignKey(MeetingSession, on_delete=models.CASCADE, related_name='transcripts')
    recording = models.ForeignKey(Recording, on_delete=models.SET_NULL, null=True, related_name='transcripts')
    language = models.CharField(max_length=50)
    transcript_text = models.TextField()
    summary_text = models.TextField(blank=True, null=True)
    action_items = models.JSONField(default=list, blank=True)
    generated_by = models.CharField(max_length=50)
    processing_status = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transcripts'


class ParticipantState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='participant_states')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='participant_states')
    username = models.CharField(max_length=100, blank=True, null=True)
    mic_on = models.BooleanField(default=True)
    video_on = models.BooleanField(default=True)
    hand_raised = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "participant_states"

    def __str__(self):
        return f"{self.username or self.user.name} in {self.meeting.id}"


class ChatMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="messages")
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_messages"