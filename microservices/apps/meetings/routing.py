from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # Handles audio, video states, hand raises, and our NEW grid_page_sync
    re_path(r'^ws/audio/(?P<meeting_id>[^/]+)/?$', consumers.MeetingConsumer.as_asgi()),
    
    # Handles the active participant list joining/leaving the grid
    re_path(r"^ws/participants/(?P<meeting_id>[\w-]+)/$", consumers.ParticipantConsumer.as_asgi()),
    
    # Handles the chat messages
    re_path(r"^ws/chat/(?P<meeting_id>[\w-]+)/$", consumers.ChatConsumer.as_asgi()),
]