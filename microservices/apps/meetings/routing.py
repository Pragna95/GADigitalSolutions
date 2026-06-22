from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # Handles the active participant list joining/leaving the grid
    re_path(r"^ws/participants/(?P<meeting_id>[\w-]+)/$", consumers.ParticipantConsumer.as_asgi()),
    
    # Handles the chat messages
    re_path(r"^ws/chat/(?P<meeting_id>[\w-]+)/$", consumers.ChatConsumer.as_asgi()),
]