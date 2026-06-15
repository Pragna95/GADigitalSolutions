from django.utils import timezone
from .models import MeetingSession, ParticipantSession, ParticipantState
from django.core.cache import cache

def join_meeting_session(session_id, user):
    session = MeetingSession.objects.get(id=session_id)
    return ParticipantSession.objects.create(
        meeting_session=session,
        user=user,
        joined_at=timezone.now()
    )

def leave_meeting_session(participant_session_id):
    participant_session = ParticipantSession.objects.get(id=participant_session_id)
    participant_session.left_at = timezone.now()
    participant_session.save()



def update_audio_state(meeting_id, user_id, mic_on):
    state, created = ParticipantState.objects.get_or_create(
        meeting_id=meeting_id,
        user_id=user_id
    )
    state.mic_on = mic_on
    state.save()


# ... your other functions ...

def add_participant_to_cache(meeting_id, user_id):
    cache_key = f"meeting_{meeting_id}_participants"
    active_users = cache.get(cache_key, set())
    active_users.add(user_id)
    cache.set(cache_key, active_users, timeout=86400)
    return active_users

def remove_participant_from_cache(meeting_id, user_id):
    cache_key = f"meeting_{meeting_id}_participants"
    active_users = cache.get(cache_key, set())
    if user_id in active_users:
        active_users.remove(user_id)
        cache.set(cache_key, active_users, timeout=86400)
    return active_users

def get_active_participants(meeting_id):
    cache_key = f"meeting_{meeting_id}_participants"
    return cache.get(cache_key, set())