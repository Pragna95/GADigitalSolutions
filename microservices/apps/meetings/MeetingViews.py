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
    kick_participant_from_room
)


def build_meeting_path(meeting, api_key=None):
    """
    Return a canonical frontend-relative meeting path.
    Format: /{product_slug}/{random_letter}/{api_key}/{meeting_id}
    """
    product_slug = "huddle"
    if meeting.product:
        product_slug = meeting.product.slug or meeting.product.name.lower().replace(" ", "-")
    
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

def get_user_by_identifier(product, user_identifier, name=None):
    if not user_identifier:
        return None

    try:
        uuid_value = UUID(str(user_identifier))
        return User.objects.get(id=uuid_value)
    except (ValueError, TypeError, User.DoesNotExist):
        user = User.objects.filter(product=product, external_user_id=str(user_identifier)).first()
        if user:
            return user

        # Attempt to parse as UUID to use as primary key
        try:
            uuid_value = UUID(str(user_identifier))
        except (ValueError, TypeError):
            uuid_value = None

        create_kwargs = {
            "product": product,
            "external_user_id": str(user_identifier),
            "email": f"{user_identifier}@huddle.local",
            "name": name or str(user_identifier),
            "role": "participant"
        }
        if uuid_value:
            create_kwargs["id"] = uuid_value

        # Create a participant record
        return User.objects.create(**create_kwargs)


class ScheduleMeetingView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):

        # Get API Key from Header
        raw_api_key = request.headers.get("X-Api-Key")

        if not raw_api_key:
            return Response(
                {"error": "X-Api-Key header is required"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Validate API Key
        # valid_api_key_obj = None

        # for api_key_obj in ProductApiKey.objects.filter(is_active=True):
        #     if check_password(raw_api_key, api_key_obj.api_key_hash):
        #         valid_api_key_obj = api_key_obj
        #         break

        # if not valid_api_key_obj:
        #     return Response(
        #         {"error": "Invalid API Key"},
        #         status=status.HTTP_401_UNAUTHORIZED
        #     )
        # TEMPORARY DEV BYPASS
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
    timezone="Asia/Kolkata"
)  
        signer = Signer()
        encrypted_api_key = signer.sign(raw_api_key)
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

            send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=participant_emails,
        fail_silently=False,)
            
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
        meetings = Meeting.objects.all().order_by('scheduled_start')
        data = []
        signer = Signer()
        raw_api_key = request.headers.get("X-Api-Key")
        for meeting in meetings:
            # Check ongoing state: active session exists with > 0 participants
            active_session = meeting.sessions.filter(status='active').first()
            is_ongoing = False
            active_participants_count = 0
            if active_session:
                active_participants_count = active_session.participant_sessions.filter(left_at__isnull=True).count()
                if active_participants_count > 0:
                    is_ongoing = True

            # Check completed state: ended session exists and not currently ongoing
            has_ended_session = meeting.sessions.filter(status='ended').exists()
            is_completed = False
            if not is_ongoing and has_ended_session:
                is_completed = True

            participants = []
            for participant in getattr(meeting, 'participants', []).all() if hasattr(meeting, 'participants') else []:
                if participant.user:
                    participants.append(participant.user.email)

            meeting_path = build_meeting_path(meeting, api_key=raw_api_key)
            data.append({
                'id': str(meeting.id),
                'title': meeting.title,
                'datetime': meeting.scheduled_start.isoformat() if meeting.scheduled_start else None,
                'participants': participants,
                'link': meeting_path,
                'meeting_code': meeting.meeting_code,
                'is_ongoing': is_ongoing,
                'is_completed': is_completed,
                'active_participants_count': active_participants_count,
                'db_status': meeting.status,
            })

        return Response(data, status=status.HTTP_200_OK)

    def delete(self, request):
        meeting_id = request.query_params.get("meeting_id") or request.data.get("meeting_id")
        if not meeting_id:
            return Response(
                {"error": "meeting_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            meeting = Meeting.objects.get(id=meeting_id)
            meeting.delete()
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
                user = User.objects.get(id=UUID(user_id))
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
        meeting_key = str(meeting.id) if meeting else meeting_identifier
        group_name  = f"meeting_{meeting_key}"

        # Persist participant state to DB only when meeting exists
        state = None
        if meeting:
            try:
                user = get_user_by_identifier(meeting.product, user_identifier, name=username)
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
        for target_group in [group_name, f"participants_{meeting_key}"]:
            async_to_sync(channel_layer.group_send)(
                target_group,
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
        for target_group in [group_name, f"participants_{meeting_key}"]:
            async_to_sync(channel_layer.group_send)(
                target_group,
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

        # Ensure the user exists in our DB under this meeting's product
        user = get_user_by_identifier(meeting.product, user_id, name=name)

        # Check if the user is the host of this meeting. If so, overwrite role to "host"
        if meeting.created_by_user == user:
            role = "host"

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

        if not all([meeting_id, action, target_identity]):
            return Response({"error": "meeting_id, action, and target_identity are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            meeting = Meeting.objects.get(id=meeting_id)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found"}, status=status.HTTP_404_NOT_FOUND)

        room_name = meeting.meeting_code

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
            if not success:
                error_msg = res
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
        messages = ChatMessage.objects.filter(
            meeting__meeting_code=meeting_id
        ).order_by("created_at")

        data = []

        for msg in messages:
            data.append({
                "id": str(msg.id),
                "user": msg.user.name,
                "message": msg.message,
                "created_at": msg.created_at
            })

        return Response(data)

    def post(self, request, meeting_id):
        user_id = request.data.get("user_id")
        message = request.data.get("message")

        meeting = Meeting.objects.get(meeting_code=meeting_id)
        user = User.objects.get(id=user_id)

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
        raw_api_key = request.headers.get("X-Api-Key")
        if not raw_api_key:
            raw_api_key = getattr(settings, "X_API_KEY", None) or "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8"

        product = meeting.product
        participant_user, created = User.objects.get_or_create(
            product=product,
            email=email,
            defaults={
                "name": email.split("@")[0].capitalize(),
                "external_user_id": email,
                "role": "participant"
            }
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

        # 4. Build canonical link
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