import traceback
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from .services import update_audio_state, add_participant_to_cache, remove_participant_from_cache


class MeetingConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.meeting_id = self.scope["url_route"]["kwargs"]["meeting_id"]
        self.user_id = "pending_user"
        self.room_group_name = f"meeting_{self.meeting_id}"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "user_id") and self.user_id != "pending_user":
            await sync_to_async(remove_participant_from_cache)(self.meeting_id, self.user_id)

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
                await sync_to_async(add_participant_to_cache)(self.meeting_id, self.user_id)

        elif message_type == "audio_state_change":
            mic_on = content.get("mic_on")
            if user_id is not None and mic_on is not None:
                await sync_to_async(update_audio_state)(self.meeting_id, user_id, mic_on)

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
        if message.get("sender_channel_name") == self.channel_name:
            return

        message.pop("sender_channel_name", None)
        await self.send_json(message)

    async def participant_update(self, event):
        await self.send_json(event["data"])


class ParticipantConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        try:
            self.meeting_id = self.scope["url_route"]["kwargs"].get("meeting_id")
            if not self.meeting_id:
                await self.close()
                return

            self.room_group_name = f"meeting_{self.meeting_id}"
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

    async def participant_update(self, event):
        await self.send_json(event["data"])