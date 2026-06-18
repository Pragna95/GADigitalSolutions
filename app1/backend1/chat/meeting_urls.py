from django.urls import path
from .meeting_views import (
    MeetingParticipantsView,
    MeetingParticipantDetailView,
    MeetingParticipantUpdateView,
    StartScreenShareView,
    StopScreenShareView,
    CurrentScreenSharerView
)

urlpatterns = [
    path('participants/<str:meeting_id>/', MeetingParticipantsView.as_view(), name='meeting_participants'),
    path('participant/<str:meeting_id>/<str:user_id>/', MeetingParticipantDetailView.as_view(), name='meeting_participant_detail'),
    path('participant/update/', MeetingParticipantUpdateView.as_view(), name='meeting_participant_update'),
    path('start-screen-share/', StartScreenShareView.as_view(), name='start_screen_share'),
    path('stop-screen-share/', StopScreenShareView.as_view(), name='stop_screen_share'),
    path('current-screen-sharer/<str:meeting_link>/', CurrentScreenSharerView.as_view(), name='current_screen_sharer'),
]
