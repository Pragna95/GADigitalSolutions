from django.urls import path
from django.contrib.auth import views as auth_views
from .views import *
from .MeetingViews import *

urlpatterns = [
    # Auth
    path('login/', CustomLoginView.as_view(), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='/login/'), name='logout'),
    path('signup/', SignupView.as_view(), name='signup'),
    
    # Dashboard
    path('super-admin/dashboard/', SuperAdminDashboardView.as_view(), name='super_admin_dashboard'),
    path('api/meeting/schedule/', ScheduleMeetingView.as_view(), name='api_schedule_meeting'),
    path('api/meetings/', ListMeetingsView.as_view(), name='api_list_meetings'),
    path('api/meeting/validate/<str:company>/<str:api_key>/<uuid:meeting_id>/', ValidateMeetingView.as_view(), name='api_validate_meeting'),
    path('api/meeting/validate-lobby/<str:meeting_id>/', ValidateMeetingView.as_view(), name='api_validate_lobby'),
    path("api/meetings/participant/<str:meeting_id>/<str:user_id>/",
    ParticipantStateView.as_view()),
    path("api/meetings/participant/update/",UpdateParticipantStateView.as_view()),
    path('api/meetings/token/', LiveKitTokenView.as_view(), name='api_livekit_token'),
    path('api/meetings/moderate/', LiveKitModerationView.as_view(), name='api_livekit_moderate'),
    path('api/meetings/webhook/', LiveKitWebhookView.as_view(), name='api_livekit_webhook'),
]

