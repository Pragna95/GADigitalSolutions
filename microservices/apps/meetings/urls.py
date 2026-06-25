from django.urls import path
from django.contrib.auth import views as auth_views
from . import views
from . import MeetingViews as meeting_views  # Changed alias to avoid conflict

urlpatterns = [
    # --- Authentication (from views.py) ---
    path('login/', views.CustomLoginView.as_view(), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='/api/login/'), name='logout'),
    path('signup/', views.SignupView.as_view(), name='signup'),
    
    # --- Admin Dashboard (from views.py) ---
    path('super-admin/dashboard/', views.SuperAdminDashboardView.as_view(), name='super_admin_dashboard'),
    
    # --- Meeting Management API (from MeetingViews.py) ---
    path('meeting/schedule/', meeting_views.ScheduleMeetingView.as_view(), name='api_schedule_meeting'),
    path('meetings/', meeting_views.ListMeetingsView.as_view(), name='api_list_meetings'),
    path('meeting/validate/<str:company>/<str:api_key>/<uuid:meeting_id>/', meeting_views.ValidateMeetingView.as_view(), name='api_validate_meeting'),
    path('meeting/validate-lobby/<str:meeting_id>/', meeting_views.ValidateMeetingView.as_view(), name='api_validate_lobby'),
    path('meeting/invite/', meeting_views.InviteParticipantView.as_view(), name='api_invite_participant'),
    
    # --- LiveKit Integration (from MeetingViews.py) ---
    path('meetings/token/', meeting_views.LiveKitTokenView.as_view(), name='api_livekit_token'),
    path('meetings/moderate/', meeting_views.LiveKitModerationView.as_view(), name='api_livekit_moderate'),
    path('meetings/webhook/', meeting_views.LiveKitWebhookView.as_view(), name='api_livekit_webhook'),
    
    # --- Real-Time Messaging (from MeetingViews.py) ---
    path("chat/<str:meeting_id>/", meeting_views.ChatMessageView.as_view(), name='api_chat'),

    # --- Participant State Class-Based Views (from MeetingViews.py) ---
    path("meetings/participant/<uuid:meeting_id>/<uuid:user_id>/", meeting_views.ParticipantStateView.as_view(), name='api_cbv_get_participant'),
    path("meetings/participant/update/", meeting_views.UpdateParticipantStateView.as_view(), name='api_cbv_update_participant'),

    # --- Real-Time Meeting Controls Function-Based Views (from views.py) ---
    path("meetings/toggle-mic/", views.toggle_mic, name='api_toggle_mic'),
    path("meetings/start-recording/", views.start_recording, name='api_start_recording'),
    path("meetings/stop-recording/", views.stop_recording, name='api_stop_recording'),
    path("meetings/start-screen-share/", views.start_screen_share, name='api_start_screen_share'),
    path("meetings/stop-screen-share/", views.stop_screen_share, name='api_stop_screen_share'),
    path("meetings/current-screen-sharer/<str:meeting_link>/", views.current_screen_sharer, name='api_current_screen_sharer'),
    path("meetings/participant/fbv/<uuid:meeting_id>/<uuid:user_id>/", views.get_participant, name='api_fbv_get_participant'),
    path("meetings/participant/fbv/update/", views.update_participant, name='api_fbv_update_participant'),
    path("meetings/participants/<uuid:meeting_id>/", views.get_all_participants, name='api_get_all_participants'),

    path('api/livekit-token/<uuid:room_uuid>/', views.livekit_token, name='api_livekit_token'),
]