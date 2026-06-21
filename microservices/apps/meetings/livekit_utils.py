import time
import jwt
import requests
from django.conf import settings

def get_livekit_settings():
    """
    Retrieve LiveKit settings from Django settings or fallback to standard defaults.
    """
    url = getattr(settings, "LIVEKIT_URL", "http://localhost:7880")
    api_key = getattr(settings, "LIVEKIT_API_KEY", "devkey")
    api_secret = getattr(settings, "LIVEKIT_API_SECRET", "secret")
    return url, api_key, api_secret

def generate_join_token(room_name, identity, name=None, role="listener", metadata=None):
    """
    Generates a Room Join Token for a LiveKit client.
    Roles:
      - 'host': can publish, subscribe, publish data, and is a room admin.
      - 'speaker': can publish, subscribe, publish data.
      - 'listener': can ONLY subscribe and publish data.
    """
    url, api_key, api_secret = get_livekit_settings()
    
    can_publish = role in ["host", "speaker"]
    is_admin = role == "host"
    
    video_grants = {
        "roomJoin": True,
        "room": room_name,
        "canPublish": can_publish,
        "canSubscribe": True,
        "canPublishData": True,
    }
    if is_admin:
        video_grants["roomAdmin"] = True

    now = int(time.time())
    payload = {
        "exp": now + 86400,  # Valid for 24 hours
        "iss": api_key,
        "sub": identity,
        "nbf": now - 60,
        "video": video_grants,
    }
    
    if name:
        payload["name"] = name
    if metadata:
        payload["metadata"] = metadata
        
    # Standard PyJWT encodes payload and signs it using api_secret
    token = jwt.encode(payload, api_secret, algorithm="HS256")
    # In PyJWT >= 2.0.0, encode returns a string. If it returns bytes (old versions), we decode it.
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token

def generate_admin_token(room_name=None):
    """
    Generates a server admin token to make authenticated API requests to LiveKit.
    """
    url, api_key, api_secret = get_livekit_settings()
    
    now = int(time.time())
    video_grants = {
        "roomAdmin": True
    }
    if room_name:
        video_grants["room"] = room_name
        
    payload = {
        "exp": now + 600,  # 10 minutes expiry
        "iss": api_key,
        "nbf": now - 10,
        "video": video_grants,
    }
    
    token = jwt.encode(payload, api_secret, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token

def make_livekit_request(service, method, payload):
    """
    Helper to send a signed POST request to LiveKit's Twirp HTTP service.
    """
    url, _, _ = get_livekit_settings()
    token = generate_admin_token(room_name=payload.get("room"))
    
    # Twirp endpoint syntax: /twirp/livekit.<Service>/<Method>
    target_url = f"{url.rstrip('/')}/twirp/livekit.{service}/{method}"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    try:
        response = requests.post(target_url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            return True, response.json() if response.content else {}
        else:
            return False, f"LiveKit error status {response.status_code}: {response.text}"
    except Exception as e:
        return False, str(e)

def update_participant_permissions(room_name, identity, can_publish=True):
    """
    Updates a participant's publish permissions dynamically in real-time.
    Used for promoting listeners to speakers or demoting speakers.
    """
    payload = {
        "room": room_name,
        "identity": identity,
        "permission": {
            "canPublish": can_publish,
            "canSubscribe": True,
            "canPublishData": True,
        }
    }
    return make_livekit_request("RoomService", "UpdateParticipant", payload)

def mute_participant_track(room_name, identity, track_sid, muted=True):
    """
    Mutes a published track (e.g. microphone) of a participant server-side.
    """
    payload = {
        "room": room_name,
        "identity": identity,
        "track_sid": track_sid,
        "muted": muted,
    }
    return make_livekit_request("RoomService", "MutePublishedTrack", payload)

def kick_participant_from_room(room_name, identity):
    """
    Removes (kicks) a participant from the LiveKit room.
    """
    payload = {
        "room": room_name,
        "identity": identity,
    }
    return make_livekit_request("RoomService", "RemoveParticipant", payload)

def delete_livekit_room(room_name):
    """
    Deletes (terminates) the LiveKit room, disconnecting all participants.
    """
    payload = {
        "room": room_name,
    }
    return make_livekit_request("RoomService", "DeleteRoom", payload)

