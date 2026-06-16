from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

urlpatterns = [
    # --- Authentication ---
    path('login/', views.CustomLoginView.as_view(), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='/login/'), name='logout'),
    path('signup/', views.SignupView.as_view(), name='signup'),
    
    # --- Admin Dashboard ---
    path('super-admin/dashboard/', views.SuperAdminDashboardView.as_view(), name='super_admin_dashboard'),
    
    # --- Meeting Management API ---
    path('api/meeting/schedule/', views.ScheduleMeetingView.as_view(), name='api_schedule_meeting'),
    path('api/meetings/', views.ListMeetingsView.as_view(), name='api_list_meetings'),
    path('api/meeting/validate/<str:company>/<str:api_key>/<uuid:meeting_id>/', views.ValidateMeetingView.as_view(), name='api_validate_meeting'),
    path('api/meeting/validate-lobby/<uuid:meeting_id>/', views.ValidateMeetingView.as_view(), name='api_validate_lobby'),
    
    # --- LiveKit Integration ---
    path('api/meetings/token/', views.LiveKitTokenView.as_view(), name='api_livekit_token'),
    path('api/meetings/moderate/', views.LiveKitModerationView.as_view(), name='api_livekit_moderate'),
    path('api/meetings/webhook/', views.LiveKitWebhookView.as_view(), name='api_livekit_webhook'),
    
    # --- Real-Time Messaging ---
    path("api/chat/<uuid:meeting_id>/", views.ChatMessageView.as_view(), name='api_chat'),

    # --- Participant State Class-Based Views ---
    path("api/meetings/participant/<uuid:meeting_id>/<uuid:user_id>/", views.ParticipantStateView.as_view(), name='api_cbv_get_participant'),
    path("api/meetings/participant/update/", views.UpdateParticipantStateView.as_view(), name='api_cbv_update_participant'),

    # --- Real-Time Meeting Controls Function-Based Views ---
    path("api/meetings/toggle-mic/", views.toggle_mic, name='api_toggle_mic'),
    path("api/meetings/start-recording/", views.start_recording, name='api_start_recording'),
    path("api/meetings/stop-recording/", views.stop_recording, name='api_stop_recording'),
    path("api/meetings/start-screen-share/", views.start_screen_share, name='api_start_screen_share'),
    path("api/meetings/stop-screen-share/", views.stop_screen_share, name='api_stop_screen_share'),
    path("api/meetings/current-screen-sharer/<str:meeting_link>/", views.current_screen_sharer, name='api_current_screen_sharer'),
    path("api/meetings/participant/fbv/<uuid:meeting_id>/<uuid:user_id>/", views.get_participant, name='api_fbv_get_participant'),
    path("api/meetings/participant/fbv/update/", views.update_participant, name='api_fbv_update_participant'),
    path("api/meetings/participants/<uuid:meeting_id>/", views.get_all_participants, name='api_get_all_participants'),
]