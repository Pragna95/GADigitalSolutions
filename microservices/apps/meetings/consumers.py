from django.core.cache import cache
import traceback
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from .services import update_audio_state, add_participant_to_cache, remove_participant_from_cache
from .models import ChatMessage, Meeting, User
from django.core.cache import cache
# ==========================================
# In-Memory Room State (From Friend's Code)
# ==========================================
ROOMS = {}

def get_room(room_name):
    if room_name not in ROOMS:
        ROOMS[room_name] = {
            "channels": {},
            "names": {},
            "user_ids": {},
        }
    return ROOMS[room_name]


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
        # NOTE: this group is ONLY for MeetingConsumer (audio/WebRTC signaling) instances.
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
            from django.core.cache import cache
            set_key = f"hands_{self.meeting_uuid}_set"
            raised_set = cache.get(set_key) or set()
            raised_set.discard(self.user_id)
            cache.set(set_key, raised_set, timeout=None)
            current_count = len(raised_set)
            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "hand_count_broadcast", "count": current_count},
            )

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

        # NEW: Sync grid pages across all users
        elif message_type == "grid_page_sync":
            page_num = content.get("page")
            if user_id is not None and page_num is not None:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "grid_page_broadcast",
                        "page": page_num,
                        "sender_user_id": user_id
                    }
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
        await self.send_json(event["data"])

    async def hand_count_broadcast(self, event):
        await self.send_json({"type": "hand_count_update", "count": event["count"]})

    # NEW: Broadcast the grid page update to the clients
    async def grid_page_broadcast(self, event):
        await self.send_json({
            "type": "grid_page_sync",
            "page": event["page"],
            "sender_user_id": event["sender_user_id"]
        })


class ParticipantConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        try:
            self.meeting_id = self.scope["url_route"]["kwargs"].get("meeting_id")
            if not self.meeting_id:
                await self.close()
                return

            from .MeetingViews import get_meeting_by_identifier
            meeting = await sync_to_async(get_meeting_by_identifier)(self.meeting_id)
            if meeting:
                self.meeting_uuid = str(meeting.id)
            else:
                self.meeting_uuid = self.meeting_id

            # FIXED: This group name was IDENTICAL to MeetingConsumer's group
            # ("meeting_<uuid>"), so both consumer classes were sharing one
            # channel-layer group. Whenever one class broadcast a message type
            # that the other class had no handler method for, Channels raised
            # an exception and silently killed that connection (causing random
            # disconnects / unreliable participant updates). Using a separate,
            # dedicated group name isolates the two consumers from each other.
            self.room_group_name = f"participants_{self.meeting_uuid}"

            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            await self.accept()
        except Exception:
            traceback.print_exc()

    async def disconnect(self, close_code):
        try:
            participants_key = f"participants_{self.meeting_uuid}"
            participants = cache.get(participants_key) or {}
            participants.pop(self.channel_name, None)
            cache.set(participants_key, participants, timeout=None)

            print("LEFT:", len(participants), participants)
            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "broadcast_participants"}
            )

            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
        except Exception:
            pass

    async def receive_json(self, content):
        if content.get("type") == "participant_join":
            name = str(content.get("name", "")).strip() or "User"
            user_id = content.get("user_id", "")

            participants_key = f"participants_{self.meeting_uuid}"
            from django.core.cache import cache

            print("CACHE BEFORE:", cache.get(participants_key))
            participants = cache.get(participants_key) or {}

            participants[self.channel_name] = {
                "id": self.channel_name,
                "name": name,
                "user_id": user_id,
            }

            cache.set(participants_key, participants, timeout=None)
            print("CACHE AFTER:", participants)
            print("JOINED:", len(participants), participants)
            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "broadcast_participants"}
            )

    async def broadcast_participants(self, event):
        participants_key = f"participants_{self.meeting_uuid}"
        participants = cache.get(participants_key) or {}

        print(
            "SENDING TO:",
            self.channel_name,
            "COUNT:",
            len(participants)
        )

        await self.send_json({
            "type": "participant_list",
            "participants": list(participants.values())
        })

    async def signal_message(self, event):
        message = event["message"]
        await self.send_json(message)

    async def participant_update(self, event):
        await self.send_json(event["data"])

    async def count_update(self, event):
        await self.send_json(event["data"])

    async def hand_count_broadcast(self, event):
        await self.send_json({
            "type": "hand_count_update",
            "count": event["count"]
        })


class ScreenShareConsumer(AsyncJsonWebsocketConsumer):
    """
    Dedicated channel for the ScreenShareModule on the frontend.
    Handles:
      - "join"               -> registers this connection, sends back the current
                                 viewer list, and tells everyone else this user joined.
      - "offer"/"answer"/
        "ice-candidate"/
        "screen-share-start"/
        "screen-share-stop"  -> relayed as-is to every other connection in the room.
    On disconnect, removes this viewer and tells everyone else they left.

    Uses its OWN group ("screen_<uuid>") and its OWN cache key
    ("screen_participants_<uuid>") so it never double-counts against the main
    "All Participants" grid, which is tracked separately by ParticipantConsumer.
    """

    async def connect(self):
        try:
            self.meeting_id = self.scope["url_route"]["kwargs"].get("meeting_id")
            if not self.meeting_id:
                await self.close()
                return

            from .MeetingViews import get_meeting_by_identifier
            meeting = await sync_to_async(get_meeting_by_identifier)(self.meeting_id)
            self.meeting_uuid = str(meeting.id) if meeting else self.meeting_id

            self.room_group_name = f"screen_{self.meeting_uuid}"
            self.user_id = None

            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()
        except Exception:
            traceback.print_exc()

    async def disconnect(self, close_code):
        try:
            if getattr(self, "user_id", None):
                participants_key = f"screen_participants_{self.meeting_uuid}"
                participants = cache.get(participants_key) or {}
                participants.pop(self.channel_name, None)
                cache.set(participants_key, participants, timeout=None)

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "participant_left_broadcast",
                        "user_id": self.user_id,
                        "sender_channel_name": self.channel_name,
                    },
                )

            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        except Exception:
            traceback.print_exc()

    async def receive_json(self, content):
        msg_type = content.get("type")

        if msg_type == "join":
            self.user_id = content.get("userId")
            name = content.get("name") or "User"

            participants_key = f"screen_participants_{self.meeting_uuid}"
            participants = cache.get(participants_key) or {}

            # Send the CURRENT list (everyone already here) only to this new client.
            await self.send_json({
                "type": "participants",
                "participants": [
                    {"userId": v["user_id"], "name": v["name"]}
                    for v in participants.values()
                ],
            })

            # Now register this client and tell everyone ELSE that they joined.
            participants[self.channel_name] = {"user_id": self.user_id, "name": name}
            cache.set(participants_key, participants, timeout=None)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "participant_joined_broadcast",
                    "participant": {"userId": self.user_id, "name": name},
                    "sender_channel_name": self.channel_name,
                },
            )
            return

        # Everything else (offer / answer / ice-candidate / screen-share-start /
        # screen-share-stop) is just relayed as-is to every other connection.
        message = content.copy()
        message["sender_channel_name"] = self.channel_name
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "relay_message", "message": message},
        )

    async def relay_message(self, event):
        message = event["message"]
        if message.get("sender_channel_name") == self.channel_name:
            return
        message.pop("sender_channel_name", None)
        await self.send_json(message)

    async def participant_joined_broadcast(self, event):
        if event.get("sender_channel_name") == self.channel_name:
            return
        await self.send_json({"type": "participant-joined", "participant": event["participant"]})

    async def participant_left_broadcast(self, event):
        if event.get("sender_channel_name") == self.channel_name:
            return
        await self.send_json({"type": "participant-left", "userId": event["user_id"]})


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