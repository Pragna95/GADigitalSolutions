from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # The ^ ensures it starts matching at 'ws/', and [^/]+ ensures it captures the whole UUID perfectly
    re_path(r'^ws/audio/(?P<meeting_id>[^/]+)/?$', consumers.MeetingConsumer.as_asgi()),
]