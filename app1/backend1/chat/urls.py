from django.urls import path
from .views import ChatRoomListCreateView, ChatMessageListCreateView

urlpatterns = [
    path('rooms/', ChatRoomListCreateView.as_view(), name='chat_room_list_create'),
    path('rooms/<int:room_id>/messages/', ChatMessageListCreateView.as_view(), name='chat_message_list_create'),
]
