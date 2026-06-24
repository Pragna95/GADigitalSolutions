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
            participants.pop(self.participant_user_id, None)
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
            participants[user_id] = {
                "id": user_id,
                "channel_name": self.channel_name,
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
    async def participant_update(self, event):
        await self.send_json(event["data"])

    async def count_update(self, event):
        await self.send_json(event["data"])

    async def hand_count_broadcast(self, event):
        await self.send_json({"type": "hand_count_update", "count": event["count"]})


@sync_to_async
def save_chat_message(meeting_id, user_id, message):
    from .MeetingViews import get_meeting_by_identifier, get_user_by_identifier
    meeting = get_meeting_by_identifier(meeting_id)
    if not meeting:
        raise ValueError(f"Meeting not found for identifier: {meeting_id}")
    user = get_user_by_identifier(meeting.product, user_id)
    if not user:
        raise ValueError(f"User not found for identifier: {user_id}")
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