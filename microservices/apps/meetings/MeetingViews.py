import random
import string
from uuid import UUID

from django.utils import timezone
from django.contrib.auth.hashers import check_password
from django.core.signing import Signer
from django.core.mail import send_mail
from django.conf import settings
from django.utils.dateparse import parse_datetime

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .models import ChatMessage

from .models import (
     ProductApiKey,
     Product,
     User,
     Meeting,
     MeetingParticipant,
     MeetingSession,
     ParticipantSession,
     ParticipantState
 )
from .livekit_utils import (
    generate_join_token,
    update_participant_permissions,
    mute_participant_track,
    kick_participant_from_room,
    delete_livekit_room
)


def build_meeting_path(meeting, api_key=None):
    """
    Return a canonical frontend-relative meeting path.
    Format: /{product_slug}/{random_letter}/{api_key}/{meeting_id}
    """
    product_slug = "huddle"
    if meeting.product:
        product_slug = meeting.product.slug or meeting.product.name.lower().replace(" ", "-")
    
    if meeting.id:
        import hashlib
        # Use a stable representation of the meeting ID for deterministic hashing.
        # For UUIDs use the hex representation; otherwise fall back to string.
        meeting_id_str = meeting.id.hex if hasattr(meeting.id, "hex") else str(meeting.id)
        hash_val = int(hashlib.md5(meeting_id_str.encode("utf-8")).hexdigest(), 16)
        random_letter = string.ascii_lowercase[hash_val % len(string.ascii_lowercase)]
    else:
        random_letter = random.choice(string.ascii_lowercase)
    
    key_to_use = api_key
    if not key_to_use:
        key_to_use = getattr(settings, "X_API_KEY", None) or "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8"
        
    return f"/{product_slug}/{random_letter}/{key_to_use}/{meeting.id}"


def generate_meeting_code():
    while True:
        segments = [
            ''.join(random.choices(string.ascii_lowercase, k=3)),
            ''.join(random.choices(string.ascii_lowercase, k=4)),
            ''.join(random.choices(string.ascii_lowercase, k=3))
        ]
        code = '-'.join(segments)

        if not Meeting.objects.filter(meeting_code=code).exists():
            return code


class ValidateMeetingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, company=None, api_key=None, meeting_id=None):
        meeting = get_meeting_by_identifier(meeting_id)
        if not meeting:
            return Response(
                {"error": "Meeting not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        if meeting.status == "completed":
            return Response(
                {"error": "This meeting has ended and cannot be joined again"},
                status=status.HTTP_400_BAD_REQUEST
            )
        participants = [
            p.user.email
            for p in meeting.participants.select_related("user").all()]

        company_name = meeting.product.name if meeting.product else "Unknown"

        return Response({
            "id": str(meeting.id),
            "title": meeting.title,
            "description": meeting.description,
            "datetime": meeting.scheduled_start,
            "created_by": str(meeting.created_by_user_id),
            "created_by_email": meeting.created_by_user.email,
            "company": meeting.product.slug if meeting.product else "huddle",
            "meeting_code": meeting.meeting_code,
            "api_key": api_key or getattr(settings, "X_API_KEY", None) or "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8",
        })

from uuid import UUID

def get_meeting_by_identifier(meeting_identifier):
    if not meeting_identifier:
        return None

    try:
        if isinstance(meeting_identifier, UUID):
            uuid_value = meeting_identifier
        else:
            uuid_value = UUID(str(meeting_identifier))
        return Meeting.objects.get(id=uuid_value)
    except (ValueError, TypeError, Meeting.DoesNotExist):
         return Meeting.objects.filter(
             meeting_code=str(meeting_identifier)
         ).first()

from django.db import IntegrityError

def get_user_by_identifier(product, uuid_value, name=None, email=None):
    from uuid import UUID
    is_uuid = False
    try:
        uuid_obj = UUID(str(uuid_value))
        is_uuid = True
    except (ValueError, TypeError):
        pass

    user = None
    if is_uuid:
        try:
            user = User.objects.get(id=uuid_value)
        except User.DoesNotExist:
            pass

    if not user and email:
        user = User.objects.filter(product=product, email__iexact=str(email)).first()

    if not user:
        if "@" in str(uuid_value):
            user = User.objects.filter(product=product, email__iexact=str(uuid_value)).first()
        if not user:
            user = User.objects.filter(product=product, external_user_id=str(uuid_value)).first()

    if user:
        if name and user.name != name and name != "Unknown User":
            user.name = name
            user.save()
        return user

    create_kwargs = {
        "product": product,
        "name": name or "Unknown User",
        "external_user_id": str(uuid_value),
        "role": "participant",
    }
    if email:
        create_kwargs["email"] = str(email)
    elif "@" in str(uuid_value):
        create_kwargs["email"] = str(uuid_value)
    else:
        create_kwargs["email"] = f"{uuid_value}@placeholder.com"

    if is_uuid:
        create_kwargs["id"] = uuid_value

    try:
        return User.objects.create(**create_kwargs)
    except IntegrityError:
        if email:
            user = User.objects.filter(product=product, email__iexact=str(email)).first()
        if not user and "@" in str(uuid_value):
            user = User.objects.filter(product=product, email__iexact=str(uuid_value)).first()
        if not user:
            user = User.objects.filter(product=product, external_user_id=str(uuid_value)).first()
        if not user and is_uuid:
            user = User.objects.filter(id=uuid_value).first()
        return user

class ScheduleMeetingView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):

        # Get API Key from Header
        raw_api_key = request.headers.get("X-Api-Key")

        valid_api_key_obj = None
        if raw_api_key:
            for api_key_obj in ProductApiKey.objects.filter(is_active=True):
                if check_password(raw_api_key, api_key_obj.api_key_hash):
                    valid_api_key_obj = api_key_obj
                    break
            if not valid_api_key_obj:
                return Response(
                    {"error": "Invalid API Key"},
                    status=status.HTTP_401_UNAUTHORIZED
                )
        else:
            # Fallback to first active API key when no key is provided.
            valid_api_key_obj = ProductApiKey.objects.filter(is_active=True).first()
            if not valid_api_key_obj:
                return Response(
                    {"error": "No active API key found"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        product = valid_api_key_obj.product

        # Request Data
        email = request.data.get("email")
        name = request.data.get("name", "Unknown User")
        title = request.data.get("title")
        description = request.data.get("description", "")
        datetime_str = request.data.get("datetime")
        participant_emails = request.data.get("participant_emails", [])

        if not email or not title or not datetime_str:
            return Response(
                {"error": "email, title and datetime are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse datetime
        scheduled_dt = parse_datetime(datetime_str)

        if not scheduled_dt:
            return Response(
                {"error": "Invalid datetime format"},
                status=status.HTTP_400_BAD_REQUEST
            )

        end_datetime_str = request.data.get("end_datetime")
        if end_datetime_str:
            scheduled_end_dt = parse_datetime(end_datetime_str)
        else:
            import datetime
            scheduled_end_dt = scheduled_dt + datetime.timedelta(hours=1) if scheduled_dt else None

        # Get or Create Host User
        user, created = User.objects.get_or_create(
            product=product,
            email=email,
            defaults={
                "name": name,
                "external_user_id": email,
                "role": "host"
            }
        )

        # Generate Meeting Code
        meeting_code = generate_meeting_code()

        # Create Meeting
        meeting = Meeting.objects.create(
    product=product,
    created_by_user=user,
    title=title,
    description=description,
    meeting_code=meeting_code,
    status="scheduled",
    scheduled_start=scheduled_dt,
    scheduled_end=scheduled_end_dt,
    timezone="Asia/Kolkata"
)  
        # Create Participants
        for participant_email in participant_emails:
            participant_user, _ = User.objects.get_or_create(
                product=product,
                email=participant_email,
                defaults={
                    "name": participant_email.split("@")[0],
                    "external_user_id": participant_email,
                    "role": "participant"
                }
            )

            MeetingParticipant.objects.create(
                meeting=meeting,
                user=participant_user,
                role="participant",
                invited_by=user,
                invitation_status="pending"
            )


        # Canonical frontend-relative meeting path
        meeting_path = build_meeting_path(meeting, api_key=raw_api_key)

        # Full meeting link used in emails
        meeting_link = f"{settings.FRONTEND_URL}{meeting_path}"

        # Send Email Invitations (Clean Format)
        if participant_emails:
            subject = f"Meeting Invitation: {title}"
            message = f"""
You have been invited to a meeting.

TITLE: {title}

DESCRIPTION: {description if description else "No description provided"}

DATE: {scheduled_dt.strftime('%d %B %Y')}

TIME: {scheduled_dt.strftime('%I:%M %p')}

MEETING LINK: {meeting_link}

Please join the meeting at the scheduled time.

Regards,
Meeting Team
"""
            try:
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=participant_emails,
                    fail_silently=False,
                )
            except Exception as e:
                print(f"[ScheduleMeetingView] Email send failed: {e}")
                # Continue scheduling even if email delivery fails.

        from django.core.cache import cache
        cache.delete(f"dashboard_meetings:{email.lower()}")
        for participant_email in participant_emails:
            cache.delete(f"dashboard_meetings:{participant_email.lower()}")

        return Response(
            {
                 "message": "Meeting scheduled successfully",
                 "meeting_id": str(meeting.id),
                 "meeting_code": meeting.meeting_code,
                 "meeting_link": meeting_link,
                 "meeting_path": meeting_path,
             },
             status=status.HTTP_201_CREATED,
         )
    

class ListMeetingsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from django.db.models import Q
        from django.core.cache import cache
        
        email = None
        if request.user and request.user.is_authenticated:
            email = request.user.email
            
        if not email:
            email = request.query_params.get("email")
            
        if not email:
            return Response([], status=status.HTTP_200_OK)
            
        # Check cache
        cache_key = f"dashboard_meetings:{email.lower()}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data, status=status.HTTP_200_OK)

        meetings = Meeting.objects.filter(
            Q(created_by_user__email__iexact=email) |
            Q(participants__user__email__iexact=email)
        ).distinct().order_by('scheduled_start')
        
        data = []
        raw_api_key = request.headers.get("X-Api-Key")
        now_time = timezone.now()
        for meeting in meetings:
            # Check if status should be updated to ongoing (Bug 3)
            if meeting.status == 'scheduled' and meeting.scheduled_start and meeting.scheduled_end:
                if meeting.scheduled_start <= now_time <= meeting.scheduled_end:
                    meeting.status = 'ongoing'
                    meeting.save()
            
            # Check ongoing state: active session exists with > 0 participants, or status is ongoing
            active_session = meeting.sessions.filter(status='active').first()
            is_ongoing = False
            active_participants_count = 0
            if active_session:
                active_participants_count = active_session.participant_sessions.filter(left_at__isnull=True).count()
                if active_participants_count > 0:
                    is_ongoing = True

            if meeting.status == 'ongoing':
                is_ongoing = True

            # Check completed state: ended session exists and not currently ongoing, or scheduled_start is in the past
            has_ended_session = meeting.sessions.filter(status='ended').exists()
            is_completed = False
            if not is_ongoing:
                if has_ended_session or meeting.status == 'completed':
                    is_completed = True
                elif meeting.scheduled_start and meeting.scheduled_start < now_time:
                    is_completed = True

            participants = []
            for participant in getattr(meeting, 'participants', []).all() if hasattr(meeting, 'participants') else []:
                if participant.user:
                    participants.append(participant.user.email)

            meeting_path = build_meeting_path(meeting, api_key=raw_api_key)
            data.append({
                'id': str(meeting.id),
                'title': meeting.title,
                'description': meeting.description or "",
                'datetime': meeting.scheduled_start.isoformat() if meeting.scheduled_start else None,
                'created_at': meeting.created_at.isoformat() if meeting.created_at else None,
                'participants': participants,
                'link': meeting_path,
                'meeting_code': meeting.meeting_code,
                'is_ongoing': is_ongoing,
                'is_completed': is_completed,
                'active_participants_count': active_participants_count,
                'db_status': meeting.status,
                'created_by': str(meeting.created_by_user_id),
                'created_by_email': meeting.created_by_user.email,
            })

        cache.set(cache_key, data, timeout=60)
        return Response(data, status=status.HTTP_200_OK)

    def delete(self, request):
        from django.core.cache import cache
        meeting_ids = request.data.get("meeting_ids") or request.query_params.get("meeting_ids")
        if meeting_ids:
            if isinstance(meeting_ids, str):
                meeting_ids = [mid.strip() for mid in meeting_ids.split(",") if mid.strip()]
            try:
                meetings_to_delete = Meeting.objects.filter(id__in=meeting_ids)
                emails_to_clear = set()
                for m in meetings_to_delete:
                    emails_to_clear.add(m.created_by_user.email.lower())
                    for p in getattr(m, 'participants', []).all() if hasattr(m, 'participants') else []:
                        if p.user:
                            emails_to_clear.add(p.user.email.lower())
                            
                deleted_count, _ = Meeting.objects.filter(id__in=meeting_ids).delete()
                for e in emails_to_clear:
                    cache.delete(f"dashboard_meetings:{e}")
                    
                return Response(
                    {"message": f"{deleted_count} meetings deleted successfully"},
                    status=status.HTTP_200_OK
                )
            except Exception as e:
                return Response(
                    {"error": str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )

        meeting_id = request.query_params.get("meeting_id") or request.data.get("meeting_id")
        if not meeting_id:
            return Response(
                {"error": "meeting_id or meeting_ids is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            meeting = Meeting.objects.get(id=meeting_id)
            emails_to_clear = {meeting.created_by_user.email.lower()}
            for p in getattr(meeting, 'participants', []).all() if hasattr(meeting, 'participants') else []:
                if p.user:
                    emails_to_clear.add(p.user.email.lower())
                    
            meeting.delete()
            for e in emails_to_clear:
                cache.delete(f"dashboard_meetings:{e}")
                
            return Response(
                {"message": "Meeting deleted successfully"},
                status=status.HTTP_200_OK
            )
        except Meeting.DoesNotExist:
            return Response(
                {"error": "Meeting not found"},
                status=status.HTTP_404_NOT_FOUND
            )

class ParticipantStateView(APIView):

    permission_classes = [AllowAny]

    def get(self, request, meeting_id, user_id):
        meeting = get_meeting_by_identifier(meeting_id)
        if not meeting:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            user = None
            try:
                user = User.objects.get(id=user_id)
            except (ValueError, User.DoesNotExist):
                user = User.objects.filter(product=meeting.product, external_user_id=user_id).first()

            if not user:
                return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

            state = ParticipantState.objects.get(meeting=meeting, user=user)

            return Response({
                "data": {
                    "mic_on": state.mic_on,
                    "video_on": state.video_on,
                    "hand_raised": state.hand_raised
                }
            })

        except ParticipantState.DoesNotExist:
            return Response(
                {"error": "Not Found"},
                status=404
            )


class UpdateParticipantStateView(APIView):
    """
    POST /api/meetings/participant/update/

    Updates participant state (mic, video, hand_raised) and broadcasts
    two events to all connected WebSocket clients in the meeting group:
      1. state_changed  — individual participant state
      2. countUpdate    — total number of raised hands in the meeting
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from django.core.cache import cache
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        meeting_identifier = str(request.data.get("meeting_id", "")).strip()
        user_identifier    = str(request.data.get("user_id", "")).strip()
        username           = request.data.get("username") or user_identifier

        if not meeting_identifier or not user_identifier:
            return Response(
                {"error": "meeting_id and user_id are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Try to resolve meeting from DB — non-fatal if it doesn't exist.
        # This allows testing with any meeting_id string without needing a DB record.
        meeting = get_meeting_by_identifier(meeting_identifier)

        # Use the real UUID when available, otherwise the raw identifier string.
        # Use the real UUID when available, otherwise the raw identifier string.
        meeting_key = str(meeting.id) if meeting else meeting_identifier

        # Persist participant state to DB only when meeting exists
        state = None
        if meeting:
            try:
                email = request.data.get("email") or user_identifier if "@" in str(user_identifier) else None
                user = get_user_by_identifier(meeting.product, user_identifier, name=username, email=email)
                if user:
                    state, _ = ParticipantState.objects.get_or_create(
                        meeting=meeting, user=user
                    )
                    if username:
                        state.username = username
                        if user.name != username:
                            user.name = username
                            user.save()
                    mic_on = request.data.get("mic_on")
                    if mic_on is not None:
                        state.mic_on = bool(mic_on)
                    video_on = request.data.get("video_on")
                    if video_on is not None:
                        state.video_on = bool(video_on)
                    hand_raised_val = request.data.get("hand_raised")
                    if hand_raised_val is not None:
                        state.hand_raised = bool(hand_raised_val)
                    state.save()
            except Exception as e:
                # DB errors must NOT block the real-time count broadcast
                print(f"[UpdateParticipantStateView] DB warning (non-fatal): {e}")

        # --- Compute per-meeting hand-raise count from cache ---
        # Each raised hand is tracked as a key in a cache set.
        cache_key = f"meeting:{meeting_key}:raised_hands"
        raised_set = cache.get(cache_key) or set()

        if request.data.get("hand_raised"):
            raised_set.add(str(user_identifier))
        else:
            raised_set.discard(str(user_identifier))

        cache.set(cache_key, raised_set, timeout=None)
        hand_raise_count = len(raised_set)

        # --- Broadcast via Django Channels ---
        channel_layer = get_channel_layer()

        # 1. Broadcast individual state_changed so other participants update their UI
        async_to_sync(channel_layer.group_send)(
            f"participants_{meeting_key}",
            {
                "type": "participant_update",
                "data": {
                    "event": "state_changed",
                    "user_id": user_identifier,
                    "username": state.username if state else username,
                    "mic_on": state.mic_on if state else request.data.get("mic_on"),
                    "video_on": state.video_on if state else request.data.get("video_on"),
                    "hand_raised": bool(request.data.get("hand_raised"))
                }
            }
        )

        # 2. Broadcast global hand-raise count so all tabs sync in real time
        async_to_sync(channel_layer.group_send)(
            f"participants_{meeting_key}",
            {
                "type": "count_update",
                "data": {
                    "event": "countUpdate",
                    "count": hand_raise_count
                }
            }
        )

        return Response({
            "message": "updated",
            "count": hand_raise_count
        })


class LiveKitTokenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        meeting_id = request.data.get("meeting_id")
        user_id = request.data.get("user_id")
        name = request.data.get("name", "Unknown User")
        role = request.data.get("role", "listener")

        if not meeting_id or not user_id:
            return Response({"error": "meeting_id and user_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            meeting = Meeting.objects.get(id=meeting_id)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        if meeting.status == "completed":
            return Response({"error": "This meeting has ended and cannot be joined again"}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure the user exists in our DB under this meeting's product
        email = request.data.get("email") or user_id if "@" in str(user_id) else None
        user = get_user_by_identifier(meeting.product, user_id, name=name, email=email)

        # Check if the user is the host of this meeting. If so, overwrite role to "host"
        if meeting.created_by_user == user:
            role = "host"

        if role not in ["host", "speaker", "listener"]:
            role = "speaker"

        # Generate join token
        token = generate_join_token(
            room_name=meeting.meeting_code,
            identity=str(user.id),
            name=name,
            role=role
        )

        # We also map settings.LIVEKIT_URL
        lk_url = getattr(settings, "LIVEKIT_URL", "http://localhost:7880")
        # Frontend usually expects ws:// or wss:// for client connection
        if lk_url.startswith("http"):
            lk_url = lk_url.replace("http", "ws", 1)

        return Response({
            "token": token,
            "url": lk_url,
            "room": meeting.meeting_code,
            "identity": str(user.id),
            "role": role,
            "name": user.name
        }, status=status.HTTP_200_OK)


class LiveKitModerationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        meeting_id = request.data.get("meeting_id")
        action = request.data.get("action")
        target_identity = request.data.get("target_identity")
        track_sid = request.data.get("track_sid")

        if not meeting_id or not action:
            return Response({"error": "meeting_id and action are required"}, status=status.HTTP_400_BAD_REQUEST)

        if action != "end_meeting" and not target_identity:
            return Response({"error": "target_identity is required for this action"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            meeting = Meeting.objects.get(id=meeting_id)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        room_name = meeting.meeting_code
        group_name = f"participants_{str(meeting.id)}"

        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()

        success = False
        error_msg = ""

        if action == "mute":
            if not track_sid:
                return Response({"error": "track_sid is required for mute action"}, status=status.HTTP_400_BAD_REQUEST)
            success, res = mute_participant_track(room_name, target_identity, track_sid, muted=True)
            if not success:
                error_msg = res
        elif action == "kick":
            success, res = kick_participant_from_room(room_name, target_identity)
            if success:
                # Broadcast moderation event to kick client in real-time
                async_to_sync(channel_layer.group_send)(
                    group_name,
                    {
                        "type": "participant_update",
                        "data": {
                            "event": "moderation",
                            "action": "kick",
                            "target_identity": target_identity
                        }
                    }
                )
            else:
                error_msg = res
        elif action == "end_meeting":
            # 1. Delete LiveKit room to disconnect all participants
            success, res = delete_livekit_room(room_name)
            
            # 2. Update meeting status to completed
            meeting.status = "completed"
            meeting.save()
            
            # 3. Terminate active meeting sessions
            active_sessions = MeetingSession.objects.filter(meeting=meeting, status="active")
            for session in active_sessions:
                session.status = "ended"
                session.ended_at = timezone.now()
                if session.started_at:
                    session.total_duration_seconds = int((session.ended_at - session.started_at).total_seconds())
                session.save()

            # 4. Broadcast end_meeting event to redirect all clients in real-time
            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    "type": "participant_update",
                    "data": {
                        "event": "moderation",
                        "action": "end_meeting"
                    }
                }
            )
            success = True
        elif action == "promote":
            success, res = update_participant_permissions(room_name, target_identity, can_publish=True)
            if not success:
                error_msg = res
        elif action == "demote":
            success, res = update_participant_permissions(room_name, target_identity, can_publish=False)
            if not success:
                error_msg = res
        else:
            return Response({"error": f"Invalid action: {action}"}, status=status.HTTP_400_BAD_REQUEST)

        if success:
            return Response({"message": f"Action {action} performed successfully"}, status=status.HTTP_200_OK)
        else:
            return Response({"error": f"Failed to perform action: {error_msg}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LiveKitWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        event_type = request.data.get("event")
        if not event_type:
            return Response({"error": "No event type"}, status=status.HTTP_400_BAD_REQUEST)

        print(f"[LiveKit Webhook] Received event: {event_type}")

        room_data = request.data.get("room", {})
        room_name = room_data.get("name")

        participant_data = request.data.get("participant", {})
        participant_identity = participant_data.get("identity")

        if not room_name:
            return Response({"message": "No room name in payload"}, status=status.HTTP_200_OK)

        try:
            meeting = Meeting.objects.get(meeting_code=room_name)
        except Meeting.DoesNotExist:
            return Response({"message": "Meeting not found for this room"}, status=status.HTTP_200_OK)

        if event_type == "room_started":
            session, created = MeetingSession.objects.get_or_create(
                meeting=meeting,
                status="active",
                defaults={
                    "session_number": meeting.sessions.count() + 1,
                    "started_at": timezone.now()
                }
            )
        elif event_type == "room_finished":
            active_sessions = MeetingSession.objects.filter(meeting=meeting, status="active")
            for session in active_sessions:
                session.status = "ended"
                session.ended_at = timezone.now()
                if session.started_at:
                    session.total_duration_seconds = int((session.ended_at - session.started_at).total_seconds())
                session.save()
        elif event_type == "participant_joined":
            if participant_identity:
                try:
                    user = User.objects.get(id=participant_identity)
                    session, _ = MeetingSession.objects.get_or_create(
                        meeting=meeting,
                        status="active",
                        defaults={
                            "session_number": meeting.sessions.count() + 1,
                            "started_at": timezone.now()
                        }
                    )
                    ParticipantSession.objects.create(
                        meeting_session=session,
                        user=user,
                        joined_at=timezone.now()
                    )
                except (User.DoesNotExist, ValueError):
                    pass
        elif event_type == "participant_left":
            if participant_identity:
                try:
                    user = User.objects.get(id=participant_identity)
                    p_sessions = ParticipantSession.objects.filter(
                        meeting_session__meeting=meeting,
                        meeting_session__status="active",
                        user=user,
                        left_at__isnull=True
                    )
                    now = timezone.now()
                    for p_sess in p_sessions:
                         p_sess.left_at = now
                         p_sess.duration_seconds = int((now - p_sess.joined_at).total_seconds())
                         p_sess.save()
                except (User.DoesNotExist, ValueError):
                    pass

        return Response({"status": "success"}, status=status.HTTP_200_OK)

class ChatMessageView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, meeting_id):
        meeting = get_meeting_by_identifier(meeting_id)
        if not meeting:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        messages = ChatMessage.objects.filter(
            meeting=meeting
        ).order_by("created_at")

        data = []

        for msg in messages:
            data.append({
                "id": str(msg.id),
                "user": msg.user.name,
                "user_id": str(msg.user.id),
                "message": msg.message,
                "created_at": msg.created_at
            })

        return Response(data)

    def post(self, request, meeting_id):
        user_id = request.data.get("user_id")
        message = request.data.get("message")

        meeting = get_meeting_by_identifier(meeting_id)
        if not meeting:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        user = get_user_by_identifier(meeting.product, user_id)
        if not user:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        chat = ChatMessage.objects.create(
            meeting=meeting,
            user=user,
            message=message
        )

        return Response({
            "id": str(chat.id),
            "message": "saved"
        })


class InviteParticipantView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        meeting_id = request.data.get("meeting_id")
        email = request.data.get("email")

        if not meeting_id or not email:
            return Response(
                {"error": "meeting_id and email are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. Resolve meeting
        meeting = get_meeting_by_identifier(meeting_id)
        if not meeting:
            return Response(
                {"error": "Meeting not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # 2. Get or create user for this participant under meeting's product
        # Resolve the canonical raw API key from the stored ProductApiKey linked to
        # this meeting's product — this guarantees the letter in the URL is always the
        # same as the one generated at meeting creation, regardless of what header the
        # caller sends.
        raw_api_key = request.headers.get("X-Api-Key")
        if not raw_api_key:
            # Try to get the raw key value from settings (set at startup) or fall back
            raw_api_key = getattr(settings, "X_API_KEY", None) or "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8"

        product = meeting.product
        # Use filter().first() instead of get_or_create to handle cases where
        # duplicate User rows exist for the same (product, email) combination.
        # get_or_create raises MultipleObjectsReturned when duplicates are present.
        participant_user = User.objects.filter(
            product=product,
            email=email,
        ).first()
        if participant_user is None:
            participant_user = User.objects.create(
                product=product,
                email=email,
                name=email.split("@")[0].capitalize(),
                external_user_id=email,
                role="participant",
            )

        # 3. Create MeetingParticipant
        MeetingParticipant.objects.get_or_create(
            meeting=meeting,
            user=participant_user,
            defaults={
                "role": "participant",
                "invited_by": meeting.created_by_user,
                "invitation_status": "pending"
            }
        )

        # 4. Build canonical link — meeting.id is a stable UUID; build_meeting_path
        #    derives the random letter deterministically via MD5(meeting.id) so this
        #    path is identical to the one returned when the meeting was created.
        meeting_path = build_meeting_path(meeting, api_key=raw_api_key)
        meeting_link = f"{settings.FRONTEND_URL}{meeting_path}"

        # 5. Send email instantly
        subject = f"Meeting Invitation: {meeting.title}"
        message = f"""
You have been invited to join a meeting in progress.

TITLE: {meeting.title}

DESCRIPTION: {meeting.description if meeting.description else "No description provided"}

MEETING LINK: {meeting_link}

Please join the meeting using the link above.

Regards,
Meeting Team
"""

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )

        return Response(
            {"message": "Invitation sent successfully", "meeting_link": meeting_link},
            status=status.HTTP_200_OK
        )