import secrets
from django.shortcuts import render, redirect
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views import View
from django.contrib import messages
from django.contrib.auth.hashers import make_password
from urllib.parse import urlencode
from django.contrib.auth.views import LoginView
from django.contrib.auth.forms import UserCreationForm
from django.urls import reverse_lazy
from django.views.generic import CreateView
from .models import *
import time
import jwt
from django.http import JsonResponse
from django.conf import settings
from django.contrib.auth.decorators import login_required

@login_required
def livekit_token(request, room_uuid):
    api_key = getattr(settings, "LIVEKIT_API_KEY", "devkey")
    api_secret = getattr(settings, "LIVEKIT_API_SECRET", "secret")
    
    now = int(time.time())
    video_grants = {
        "roomJoin": True,
        "room": str(room_uuid),
        "canPublish": True,
        "canSubscribe": True,
        "canPublishData": True,
    }
    
    payload = {
        "exp": now + 86400,  # 24 hours
        "iss": api_key,
        "sub": str(request.user.id),
        "nbf": now - 60,
        "video": video_grants,
        "name": request.user.username,
    }
    
    token = jwt.encode(payload, api_secret, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    
    return JsonResponse({
        "token": token,
        "url": getattr(settings, "LIVEKIT_URL", "http://localhost:7880")
    })

class CustomLoginView(LoginView):
    template_name = 'auth/login.html'
    redirect_authenticated_user = True
    
    def get_success_url(self):
        redirect_to = self.request.POST.get(
            self.redirect_field_name, 
            self.request.GET.get(self.redirect_field_name, "")
        )
        print(f"DEBUG CustomLoginView: redirect_to='{redirect_to}', FRONTEND_URL='{settings.FRONTEND_URL}'")
        
        if redirect_to and redirect_to.startswith(settings.FRONTEND_URL):
            print(f"DEBUG CustomLoginView: MATCHED frontend url, returning {redirect_to}")
            return redirect_to
            
        url = self.get_redirect_url()
        print(f"DEBUG CustomLoginView: did NOT match, returning get_redirect_url '{url}' or super '{super().get_success_url()}'")
        return url or super().get_success_url()
    
    def form_invalid(self, form):
        messages.error(self.request, "Invalid username or password.")
        return super().form_invalid(form)

class SignupView(CreateView):
    form_class = UserCreationForm
    template_name = 'auth/signup.html'
    success_url = reverse_lazy('login')
    
    def get_success_url(self):
        url = super().get_success_url()
        next_url = self.request.POST.get('next') or self.request.GET.get('next')
        if next_url:
            return f"{url}?{urlencode({'next': next_url})}"
        return url
    
    def form_valid(self, form):
        messages.success(self.request, "Account created successfully! Please log in.")
        return super().form_valid(form)

    def form_invalid(self, form):
        messages.error(self.request, "Could not create account. Please check the errors below.")
        return super().form_invalid(form)

class SuperAdminDashboardView(LoginRequiredMixin, View):
    template_name = 'super_admin/dashboard.html'
    
    def get(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            messages.error(request, "You do not have permission to access the dashboard.")
            return redirect('/')
            
        products = Product.objects.all().order_by('-created_at')
        api_keys = ProductApiKey.objects.all().order_by('-created_at')
        
        context = {
            'products': products,
            'api_keys': api_keys,
        }
        return render(request, self.template_name, context)

    def post(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            return redirect('/')
            
        action = request.POST.get('action')
        
        if action == 'create_product':
            name = request.POST.get('name')
            slug = request.POST.get('slug')
            status = request.POST.get('status', 'active')
            webhook_url = request.POST.get('webhook_url', '')
            
            if Product.objects.filter(slug=slug).exists():
                messages.error(request, f"Product with slug '{slug}' already exists.")
            else:
                Product.objects.create(
                    name=name,
                    slug=slug,
                    status=status,
                    webhook_url=webhook_url
                )
                messages.success(request, f"Product '{name}' registered successfully.")
                
        elif action == 'generate_api_key':
            product_id = request.POST.get('product_id')
            environment = request.POST.get('environment', 'development')
            rate_limit = request.POST.get('rate_limit', 1000)
            
            try:
                product = Product.objects.get(id=product_id)
                raw_api_key = secrets.token_urlsafe(32)
                ProductApiKey.objects.create(
                    product=product,
                    api_key_hash=make_password(raw_api_key),
                    environment=environment,
                    rate_limit=rate_limit,
                    is_active=True
                )
                msg = f"API Key generated for {product.name} ({environment}):<br><br>"
                msg += f"<div class='raw-key-box'>{raw_api_key}</div>"
                msg += "Please copy it now. You will not be able to see it again!"
                messages.success(request, msg)
                
            except Product.DoesNotExist:
                messages.error(request, "Selected product does not exist.")
                
        return redirect('super_admin_dashboard')


from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.utils.timezone import now
from django.core.cache import cache
import json

from .models import Recording
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


# ─────────────────────────────────────────────────────────────────────────────
# CACHE-ONLY participant state helpers
# (No DB ParticipantState writes — avoids ForeignKey/migration issues with
#  raw string userIds coming from the frontend.)
# ─────────────────────────────────────────────────────────────────────────────

def _state_key(meeting_uuid, user_id):
    return f"pstate:{meeting_uuid}:{user_id}"

def _get_state(meeting_uuid, user_id, username=""):
    key = _state_key(meeting_uuid, user_id)
    state = cache.get(key)
    if state is None:
        state = {
            "user_id": user_id,
            "username": username or f"User_{user_id}",
            "mic_on": True,
            "video_on": True,
            "hand_raised": False,
        }
        cache.set(key, state, timeout=None)
    return state

def _save_state(meeting_uuid, user_id, state):
    cache.set(_state_key(meeting_uuid, user_id), state, timeout=None)

    # Also keep a set of known user_ids for this meeting so get_all_participants works
    members_key = f"pstate_members:{meeting_uuid}"
    members = cache.get(members_key) or set()
    members.add(user_id)
    cache.set(members_key, members, timeout=None)


@csrf_exempt
def toggle_mic(request):
    if request.method == "POST":
        data = json.loads(request.body)
        user_id = data.get("user_id")
        meeting_id = data.get("meeting_id")
        mic_on = data.get("mic_on")
        username = data.get("username", f"User_{user_id}")

        meeting = get_meeting_by_identifier(meeting_id)
        if not meeting:
            return JsonResponse({"error": "Meeting not found"}, status=404)

        meeting_uuid = str(meeting.id)
        state = _get_state(meeting_uuid, user_id, username)
        state["mic_on"] = bool(mic_on)
        _save_state(meeting_uuid, user_id, state)

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"participants_{meeting_uuid}",
            {
                "type": "participant_update",
                "data": {
                    "event": "state_changed",
                    "user_id": user_id,
                    "username": state["username"],
                    "mic_on": state["mic_on"],
                    "video_on": state["video_on"],
                    "hand_raised": state["hand_raised"],
                }
            }
        )

        return JsonResponse({"message": "Mic state updated", "mic_on": state["mic_on"]})
    return JsonResponse({"error": "Only POST allowed"}, status=400)


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
        return Meeting.objects.filter(meeting_code=str(meeting_identifier)).first()


@csrf_exempt
def start_recording(request):
    if request.method == "POST":
        data = json.loads(request.body)
        meeting_link = data.get("meeting_link")
        started_by = data.get("started_by")

        meeting_session = None
        if meeting_link:
            parts = [p.strip() for p in meeting_link.split("/") if p.strip()]
            for part in parts:
                meeting = get_meeting_by_identifier(part)
                if meeting:
                    meeting_session = MeetingSession.objects.filter(meeting=meeting, status="active").first()
                    break

        recording = Recording.objects.create(
            meeting_session=meeting_session,
            meeting_link=meeting_link,
            started_by=started_by,
            processing_status="STARTED"
        )

        cache.set(
            f"meeting:{meeting_link}:recording",
            {"recording": True, "recording_id": recording.id},
            timeout=None
        )

        return JsonResponse({"message": "Recording Started", "recording_id": recording.id})
    return JsonResponse({"error": "Only POST allowed"}, status=400)


@csrf_exempt
def stop_recording(request):
    if request.method == "POST":
        data = json.loads(request.body)
        recording_id = data.get("recording_id")
        meeting_link = data.get("meeting_link")

        try:
            recording = Recording.objects.get(id=recording_id)
        except Recording.DoesNotExist:
            return JsonResponse({"error": "Recording session not found"}, status=404)

        recording.processing_status = "STOPPED"
        recording.ended_at = now()
        duration = (recording.ended_at - recording.started_at).seconds
        recording.duration_seconds = duration
        recording.save()

        cache.set(f"meeting:{meeting_link}:recording", {"recording": False}, timeout=None)

        return JsonResponse({"message": "Recording Stopped", "duration": duration})
    return JsonResponse({"error": "Only POST allowed"}, status=400)


@csrf_exempt
def start_screen_share(request):
    if request.method == "POST":
        data = json.loads(request.body)
        meeting_link = data.get("meeting_link")
        user_id = data.get("user_id")

        if not meeting_link or not user_id:
            return JsonResponse({"message": "Missing data"}, status=400)

        key = f"meeting:{meeting_link}:screen_share"
        current = cache.get(key)

        if current:
            return JsonResponse({"message": "Someone is already sharing screen", "current_user": current.get("user_id")}, status=400)

        cache.set(key, {"user_id": user_id, "started_at": int(now().timestamp())}, timeout=None)
        return JsonResponse({"message": "Screen sharing started", "user_id": user_id})
    return JsonResponse({"error": "Only POST allowed"}, status=400)


@csrf_exempt
def stop_screen_share(request):
    if request.method == "POST":
        data = json.loads(request.body)
        meeting_link = data.get("meeting_link")
        user_id = data.get("user_id")

        if not meeting_link or not user_id:
            return JsonResponse({"message": "Missing data"}, status=400)

        key = f"meeting:{meeting_link}:screen_share"
        current = cache.get(key)

        if not current:
            return JsonResponse({"message": "No active screen share"}, status=400)
        if current.get("user_id") != user_id:
            return JsonResponse({"message": "You are not the active screen sharer"}, status=403)

        cache.delete(key)
        return JsonResponse({"message": "Screen sharing stopped"})
    return JsonResponse({"error": "Only POST allowed"}, status=400)


def current_screen_sharer(request, meeting_link):
    key = f"meeting:{meeting_link}:screen_share"
    screen_share = cache.get(key)
    return JsonResponse({"screen_share": screen_share})


@csrf_exempt
def get_participant(request, meeting_id, user_id):
    """
    ✅ FIX: DB కాదు — cache నుండి participant state తీసుకుంటున్నాం.
    DB లో raw userId తో User object లేదు కాబట్టి 404 వస్తోంది.
    Cache లో ఉంటే return చేస్తాం, లేకపోతే 404 — frontend fetchParticipantState లో
    404 వస్తే default state తో start అవుతుంది (అది already handle అయింది).
    """
    meeting = get_meeting_by_identifier(meeting_id)
    if not meeting:
        return JsonResponse({"error": "Meeting not found"}, status=404)

    meeting_uuid = str(meeting.id)
    key = _state_key(meeting_uuid, user_id)
    state = cache.get(key)

    if not state:
        return JsonResponse({"error": "Participant not found"}, status=404)

    return JsonResponse({"data": state})


@csrf_exempt
def update_participant(request):
    """
    ✅ FIX: Cache లో state save చేస్తున్నాం + participants group కి కూడా
    broadcast చేస్తున్నాం (hand raise real-time update కోసం).
    """
    if request.method == "POST":
        data = json.loads(request.body)

        user_id = data.get("user_id")
        meeting_id = data.get("meeting_id")
        username = data.get("username", f"User_{user_id}")
        mic_on = data.get("mic_on")
        video_on = data.get("video_on")
        hand_raised = data.get("hand_raised")

        meeting = get_meeting_by_identifier(meeting_id)
        if not meeting:
            return JsonResponse({"error": "Meeting not found"}, status=404)

        meeting_uuid = str(meeting.id)
        state = _get_state(meeting_uuid, user_id, username)

        if username:
            state["username"] = username
        if mic_on is not None:
            state["mic_on"] = bool(mic_on)
        if video_on is not None:
            state["video_on"] = bool(video_on)
        if hand_raised is not None:
            state["hand_raised"] = bool(hand_raised)

        _save_state(meeting_uuid, user_id, state)

        channel_layer = get_channel_layer()

        # Broadcast to participants group
        async_to_sync(channel_layer.group_send)(
            f"participants_{meeting_uuid}",
            {
                "type": "participant_update",
                "data": {
                    "event": "state_changed",
                    "user_id": user_id,
                    "username": state["username"],
                    "mic_on": state["mic_on"],
                    "video_on": state["video_on"],
                    "hand_raised": state["hand_raised"],
                }
            }
        )

        return JsonResponse({
            "message": "Participant updated",
            "data": {
                "user_id": user_id,
                "username": state["username"],
                "meeting_id": meeting_id,
                "mic_on": state["mic_on"],
                "video_on": state["video_on"],
                "hand_raised": state["hand_raised"],
            }
        })

    return JsonResponse({"error": "Only POST allowed"}, status=400)


@csrf_exempt
def get_all_participants(request, meeting_id):
    meeting = get_meeting_by_identifier(meeting_id)
    if not meeting:
        return JsonResponse({"data": []})

    meeting_uuid = str(meeting.id)
    members_key = f"pstate_members:{meeting_uuid}"
    members = cache.get(members_key) or set()

    data = []
    for uid in members:
        state = cache.get(_state_key(meeting_uuid, uid))
        if state:
            data.append(state)

    return JsonResponse({"data": data})