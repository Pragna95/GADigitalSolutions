from django.core.cache import cache
import traceback
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from .services import update_audio_state, add_participant_to_cache, remove_participant_from_cache
from .models import ChatMessage, Meeting, User
from django.core.cache import cache

ROOMS = {}

def get_room(room_name):
    if room_name not in ROOMS:
        ROOMS[room_name] = {"channels": {}, "names": {}, "user_ids": {}}
    return ROOMS[room_name]

ACTIVE_MEETINGS = set()


class MeetingConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.meeting_id = self.scope["url_route"]["kwargs"]["meeting_id"]

        from .MeetingViews import get_meeting_by_identifier
        meeting = await sync_to_async(get_meeting_by_identifier)(self.meeting_id)
        self.meeting_uuid = str(meeting.id) if meeting else self.meeting_id

        self.user_id = "pending_user"
        self.room_group_name = f"meeting_{self.meeting_uuid}"

        global ACTIVE_MEETINGS
        if self.meeting_uuid not in ACTIVE_MEETINGS:
            ACTIVE_MEETINGS.add(self.meeting_uuid)
            cache.delete(f"meeting_{self.meeting_uuid}_participants")
            cache.delete(f"meeting:{self.meeting_uuid}:raised_hands")
            cache.delete(f"hands_{self.meeting_uuid}_set")

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "hand_count_init", "count": 0})

    async def disconnect(self, close_code):
        if hasattr(self, "user_id") and self.user_id != "pending_user":
            await sync_to_async(remove_participant_from_cache)(self.meeting_uuid, self.user_id)
            set_key = f"meeting:{self.meeting_uuid}:raised_hands"
            raised_set = cache.get(set_key) or set()
            raised_set.discard(self.user_id)
            cache.set(set_key, raised_set, timeout=None)
            current_count = len(raised_set)
            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "hand_count_broadcast", "count": current_count},
            )

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

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
                set_key = f"meeting:{self.meeting_uuid}:raised_hands"
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

        elif message_type == "grid_page_sync":
            page_num = content.get("page")
            if user_id is not None and page_num is not None:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "grid_page_broadcast", "page": page_num, "sender_user_id": user_id}
                )

        message = content.copy()
        message["sender_channel_name"] = self.channel_name
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "signal_message", "message": message},
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

    async def grid_page_broadcast(self, event):
        await self.send_json({"type": "grid_page_sync", "page": event["page"], "sender_user_id": event["sender_user_id"]})


class ParticipantConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        try:
            self.meeting_id = self.scope["url_route"]["kwargs"].get("meeting_id")
            if not self.meeting_id:
                await self.close()
                return

            from .MeetingViews import get_meeting_by_identifier
            meeting = await sync_to_async(get_meeting_by_identifier)(self.meeting_id)
            self.meeting_uuid = str(meeting.id) if meeting else self.meeting_id
            self.room_group_name = f"participants_{self.meeting_uuid}"
            self.participant_name = ""
            self.participant_user_id = ""

            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()

            current_count = len(cache.get(f"meeting:{self.meeting_uuid}:raised_hands") or set())
            await self.send_json({"type": "hand_count_init", "count": current_count})
        except Exception:
            traceback.print_exc()

    async def disconnect(self, close_code):
        try:
            participants_key = f"participants_{self.meeting_uuid}"
            participants = cache.get(participants_key) or {}
            participants.pop(self.channel_name, None)
            cache.set(participants_key, participants, timeout=None)

            # ✅ Hand raise cache tempt చేయాలి — left అయిన participant raise చేస్తే తీసేయాలి
            if self.participant_user_id:
                set_key = f"meeting:{self.meeting_uuid}:raised_hands"
                raised_set = cache.get(set_key) or set()
                was_raised = self.participant_user_id in raised_set
                raised_set.discard(self.participant_user_id)
                cache.set(set_key, raised_set, timeout=None)

                if was_raised:
                    # Hand raise count update broadcast
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "hand_raise_broadcast",
                            "user_id": self.participant_user_id,
                            "user_name": self.participant_name,
                            "is_raised": False,
                            "count": len(raised_set),
                        }
                    )

            print("LEFT:", len(participants), participants)

            # ✅ Ghost notification — participant left
            if self.participant_name:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "presence_broadcast",
                        "event": "left",
                        "name": self.participant_name,
                        "user_id": self.participant_user_id,
                        "sender_channel_name": self.channel_name,
                    }
                )

            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "broadcast_participants"}
            )

            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        except Exception:
            traceback.print_exc()

    async def receive_json(self, content):
        msg_type = content.get("type")

        if msg_type == "participant_join":
            name = str(content.get("name", "")).strip() or "User"
            user_id = content.get("user_id", "")

            self.participant_name = name
            self.participant_user_id = user_id

            participants_key = f"participants_{self.meeting_uuid}"
            participants = cache.get(participants_key) or {}

            print("CACHE BEFORE:", participants)
            participants[self.channel_name] = {
                "id": self.channel_name,
                "name": name,
                "user_id": user_id,
            }
            cache.set(participants_key, participants, timeout=None)
            print("CACHE AFTER:", participants)
            print("JOINED:", len(participants), participants)

            # ✅ Ghost notification — participant joined
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "presence_broadcast",
                    "event": "joined",
                    "name": name,
                    "user_id": user_id,
                    "sender_channel_name": self.channel_name,
                }
            )

            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "broadcast_participants"}
            )

        # ✅ Hand raise via ParticipantWS — అన్ని tabs కి broadcast
        elif msg_type == "hand_raise":
            user_id = content.get("user_id", "")
            user_name = content.get("user_name", "")
            is_raised = content.get("is_raised", False)

            set_key = f"meeting:{self.meeting_uuid}:raised_hands"
            raised_set = cache.get(set_key) or set()
            if is_raised:
                raised_set.add(user_id)
            else:
                raised_set.discard(user_id)
            cache.set(set_key, raised_set, timeout=None)
            current_count = len(raised_set)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "hand_raise_broadcast",
                    "user_id": user_id,
                    "user_name": user_name,
                    "is_raised": is_raised,
                    "count": current_count,
                }
            )

    async def hand_raise_broadcast(self, event):
        """అన్ని tabs కి hand raise event + count పంపుతుంది"""
        await self.send_json({
            "type": "hand_raise",
            "user_id": event["user_id"],
            "user_name": event["user_name"],
            "is_raised": event["is_raised"],
        })
        await self.send_json({
            "type": "hand_count_update",
            "count": event["count"],
        })

    async def presence_broadcast(self, event):
        """
        ✅ Join/Leave ghost notification అందరికీ పంపుతుంది.
        Sender తనే joined అని తనకు చూపించకుండా skip చేస్తున్నాం.
        """
        if event.get("sender_channel_name") == self.channel_name:
            return
        await self.send_json({
            "type": "presence_event",
            "event": event["event"],       # "joined" or "left"
            "name": event["name"],
            "user_id": event["user_id"],
        })

    async def broadcast_participants(self, event):
        participants_key = f"participants_{self.meeting_uuid}"
        participants = cache.get(participants_key) or {}

        print("SENDING TO:", self.channel_name, "COUNT:", len(participants))

        await self.send_json({
            "type": "participant_list",
            "participants": list(participants.values())
        })

    async def signal_message(self, event):
        await self.send_json(event["message"])

    async def participant_update(self, event):
        await self.send_json(event["data"])

    async def count_update(self, event):
        await self.send_json(event["data"])

    async def hand_count_broadcast(self, event):
        await self.send_json({"type": "hand_count_update", "count": event["count"]})


class ScreenShareConsumer(AsyncJsonWebsocketConsumer):

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

            await self.send_json({
                "type": "participants",
                "participants": [{"userId": v["user_id"], "name": v["name"]} for v in participants.values()],
            })

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
    return ChatMessage.objects.create(meeting=meeting, user=user, message=message)


class ChatConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        self.meeting_id = self.scope["url_route"]["kwargs"]["meeting_id"]
        self.room_group_name = f"chat_{self.meeting_id}"
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive_json(self, content):
        user_id = content.get("user_id")
        message = content.get("message")
        if user_id and message:
            await save_chat_message(self.meeting_id, user_id, message)
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "chat_message", "message": content}
        )

    async def chat_message(self, event):
        await self.send_json(event["message"])