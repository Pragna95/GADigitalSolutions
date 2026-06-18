from django.urls import path
from .consumers import ChatConsumer, AudioConsumer, ParticipantsConsumer, MeetingConsumer

websocket_urlpatterns = [
    path('ws/chat/<str:room_id>/', ChatConsumer.as_asgi()),
    path('ws/audio/<str:meeting_id>/', AudioConsumer.as_asgi()),
    path('ws/participants/<str:meeting_id>/', ParticipantsConsumer.as_asgi()),
    path('ws/meeting/<str:meeting_id>/', MeetingConsumer.as_asgi()),
]
