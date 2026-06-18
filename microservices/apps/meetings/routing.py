from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/audio/(?P<meeting_id>[^/]+)/?$', consumers.MeetingConsumer.as_asgi()),
    re_path(
        r"^ws/participants/(?P<meeting_id>[\w-]+)/$",
        consumers.ParticipantConsumer.as_asgi(),
    ),
    re_path(r"^ws/chat/(?P<meeting_id>[\w-]+)/$",consumers.ChatConsumer.as_asgi(),
),
]