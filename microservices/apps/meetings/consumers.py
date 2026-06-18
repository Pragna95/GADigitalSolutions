import traceback
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from .services import update_audio_state, add_participant_to_cache, remove_participant_from_cache
from .models import ChatMessage, Meeting, User

class MeetingConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.meeting_id = self.scope["url_route"]["kwargs"]["meeting_id"]
        
        # Resolve meeting_id to UUID if it is a meeting code
        from .MeetingViews import get_meeting_by_identifier
        meeting = await sync_to_async(get_meeting_by_identifier)(self.meeting_id)
        if meeting:
            self.meeting_uuid = str(meeting.id)
        else:
            self.meeting_uuid = self.meeting_id

        self.user_id = "pending_user"
        self.room_group_name = f"meeting_{self.meeting_uuid}"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )
        await self.accept()
        await self.send_json({"type": "hand_count_init", "count": 0})

    async def disconnect(self, close_code):
        if hasattr(self, "user_id") and self.user_id != "pending_user":
            await sync_to_async(remove_participant_from_cache)(self.meeting_uuid, self.user_id)

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name,
        )

    async def receive_json(self, content):
        message_type = content.get("type")
        user_id = content.get("user_id")

        if message_type == "join_audio" and user_id:
            if getattr(self, "user_id", "pending_user") == "pending_user":
                self.user_id = user_id
                await sync_to_async(add_participant_to_cache)(self.meeting_uuid, self.user_id)

        elif message_type == "audio_state_change":
            mic_on = content.get("mic_on")
            if user_id is not None and mic_on is not None:
                await sync_to_async(update_audio_state)(self.meeting_uuid, user_id, mic_on)

        elif message_type == "hand_raise":
            is_raised = content.get("is_raised")
            if user_id is not None and is_raised is not None:
                from django.core.cache import cache
                set_key = f"hands_{self.meeting_uuid}_set"
                raised_set = cache.get(set_key) or set()
                if is_raised:
                    raised_set.add(user_id)
                else:
                    raised_set.discard(user_id)
                cache.set(set_key, raised_set, timeout=None)
                current_count = len(raised_set)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "hand_count_broadcast", "count": current_count},
                )

        message = content.copy()
        message["sender_channel_name"] = self.channel_name

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "signal_message",
                "message": message,
            },
        )

    async def signal_message(self, event):
        message = event["message"]
        msg_type = message.get("type")
        if msg_type != "hand_raise" and message.get("sender_channel_name") == self.channel_name:
            return

        message.pop("sender_channel_name", None)
        await self.send_json(message)

    async def participant_update(self, event):
        await self.send_json(event["data"])

    async def count_update(self, event):
        """Forward countUpdate broadcast to this WebSocket client."""
        await self.send_json(event["data"])

    async def hand_count_broadcast(self, event):
        await self.send_json({"type": "hand_count_update", "count": event["count"]})

class ParticipantConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        try:
            self.meeting_id = self.scope["url_route"]["kwargs"].get("meeting_id")
            if not self.meeting_id:
                await self.close()
                return

            # Resolve meeting_id to UUID if it is a meeting code
            from .MeetingViews import get_meeting_by_identifier
            meeting = await sync_to_async(get_meeting_by_identifier)(self.meeting_id)
            if meeting:
                self.meeting_uuid = str(meeting.id)
            else:
                self.meeting_uuid = self.meeting_id

            self.room_group_name = f"meeting_{self.meeting_uuid}"
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            await self.accept()
        except Exception:
            traceback.print_exc()

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
        except Exception:
            pass

    async def signal_message(self, event):
        """Forward hand_raise and other signals to participant list"""
        message = event["message"]
        await self.send_json(message)

    async def participant_update(self, event):
        await self.send_json(event["data"])

    async def count_update(self, event):
        """Forward countUpdate broadcast to this WebSocket client."""
        await self.send_json(event["data"])

    async def hand_count_broadcast(self, event):
        await self.send_json({
            "type": "hand_count_update",
            "count": event["count"]
        })
        
from channels.generic.websocket import AsyncJsonWebsocketConsumer
@sync_to_async
def save_chat_message(meeting_id, user_id, message):

    meeting = Meeting.objects.get(meeting_code=meeting_id)
    user = User.objects.get(id=user_id)

    return ChatMessage.objects.create(
        meeting=meeting,
        user=user,
        message=message,
    )
class ChatConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.meeting_id = self.scope["url_route"]["kwargs"]["meeting_id"]
        self.room_group_name = f"chat_{self.meeting_id}"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive_json(self, content):
        user_id = content.get("user_id")
        message = content.get("message")

        if user_id and message:
         await save_chat_message(
          self.meeting_id,
          user_id,
          message
       )
     
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": content
            }
        )

    async def chat_message(self, event):
        await self.send_json(event["message"])
