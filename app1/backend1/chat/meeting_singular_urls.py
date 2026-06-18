from django.urls import path
from .views import (
    MeetingScheduleView,
    MeetingValidateView,
    MeetingValidateLobbyView,
)

urlpatterns = [
    path('schedule/', MeetingScheduleView.as_view(), name='meeting_schedule'),
    path('validate/<str:meeting_code>/<str:meeting_id>/', MeetingValidateView.as_view(), name='meeting_validate'),
    path('validate/<str:company>/<str:api_key>/<str:meeting_id>/', MeetingValidateView.as_view(), name='meeting_validate_legacy'),
    path('validate-lobby/<str:meeting_id>/', MeetingValidateLobbyView.as_view(), name='meeting_validate_lobby'),
]
