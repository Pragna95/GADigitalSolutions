import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from .models import ChatRoom, ChatMessage
from .meeting_state import state_manager

User = get_user_model()

# ==========================================
# 1. Real-time Chat Consumer
# ==========================================
class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'chat_{self.room_id}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive_json(self, content):
        msg_type = content.get('type')
        
        if msg_type == 'chat_message':
            message_text = content.get('message', '')
            user_id = content.get('user_id')

            if not message_text or not user_id:
                return

            # Save message to database
            saved_msg = await self.save_message(user_id, self.room_id, message_text)

            # Send message to room group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_chat_message',
                    'id': saved_msg['id'],
                    'room_id': int(self.room_id),
                    'content': message_text,
                    'sender': saved_msg['sender'],
                    'timestamp': saved_msg['timestamp']
                }
            )

    async def broadcast_chat_message(self, event):
        # Send message to WebSocket client
        await self.send_json({
            'type': 'chat_message',
            'id': event['id'],
            'room_id': event['room_id'],
            'content': event['content'],
            'sender': event['sender'],
            'timestamp': event['timestamp']
        })

    @database_sync_to_async
    def save_message(self, user_id, room_id, content):
        user = User.objects.get(id=user_id)
        room = ChatRoom.objects.get(id=room_id)
        msg = ChatMessage.objects.create(room=room, sender=user, content=content)
        return {
            'id': msg.id,
            'sender': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'name': user.name
            },
            'timestamp': msg.timestamp.isoformat()
        }


# ==========================================
# 2. Audio & Hand Raise Consumer
# ==========================================
class AudioConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.meeting_id = self.scope['url_route']['kwargs']['meeting_id']
        self.room_group_name = f'audio_{self.meeting_id}'

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
        msg_type = content.get('type')
        sender = content.get('sender')
        meeting_id = content.get('meeting_id', self.meeting_id)

        if msg_type == 'hand_raise':
            user_id = content.get('user_id')
            user_name = content.get('user_name')
            is_raised = content.get('is_raised', False)

            # Update participant's hand raised status
            state_manager.update_participant(
                meeting_id=meeting_id,
                user_id=user_id,
                name=user_name,
                hand_raised=is_raised
            )

            # Calculate total hand raises in this room
            parts = state_manager.get_participants(meeting_id)
            raised_count = sum(1 for p in parts.values() if p.get('hand_raised', False))

            # Broadcast state_changed to the audio group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_hand_raise_state',
                    'event': 'state_changed',
                    'user_id': user_id,
                    'username': user_name,
                    'hand_raised': is_raised
                }
            )

            # Broadcast countUpdate to audio group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_hand_raise_count',
                    'event': 'countUpdate',
                    'count': raised_count
                }
            )

            # Also broadcast countUpdate to participants group
            participants_group_name = f'participants_{meeting_id}'
            await self.channel_layer.group_send(
                participants_group_name,
                {
                    'type': 'broadcast_hand_raise_count',
                    'event': 'countUpdate',
                    'count': raised_count
                }
            )
        else:
            # Broadcast general signals (offer, answer, ice, join, leave) to the group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_signal',
                    'sender': sender,
                    'meeting_id': meeting_id,
                    'payload': content
                }
            )

    async def broadcast_hand_raise_state(self, event):
        await self.send_json({
            'event': 'state_changed',
            'user_id': event['user_id'],
            'username': event['username'],
            'hand_raised': event['hand_raised']
        })

    async def broadcast_hand_raise_count(self, event):
        await self.send_json({
            'event': 'countUpdate',
            'count': event['count']
        })

    async def broadcast_signal(self, event):
        # Do not echo back to the sender
        payload = event['payload']
        if payload.get('sender') != self.channel_name:
            await self.send_json(payload)


# ==========================================
# 3. Participants Consumer
# ==========================================
class ParticipantsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.meeting_id = self.scope['url_route']['kwargs']['meeting_id']
        self.room_group_name = f'participants_{self.meeting_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        # Immediately send the current count on connection
        parts = state_manager.get_participants(self.meeting_id)
        raised_count = sum(1 for p in parts.values() if p.get('hand_raised', False))
        await self.send_json({
            'event': 'countUpdate',
            'count': raised_count
        })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive_json(self, content):
        pass

    async def broadcast_hand_raise_count(self, event):
        await self.send_json({
            'event': 'countUpdate',
            'count': event['count']
        })


# ==========================================
# 4. Meeting Consumer (Screen Share / Room Join)
# ==========================================
class MeetingConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.meeting_id = self.scope['url_route']['kwargs']['meeting_id']
        self.room_group_name = f'meeting_{self.meeting_id}'
        self.user_id = None

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        if self.user_id:
            # Remove from participant list
            state_manager.remove_participant(self.meeting_id, self.user_id)
            
            # Broadcast leave to others
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_meeting_event',
                    'payload': {
                        'type': 'participant-left',
                        'userId': self.user_id
                    }
                }
            )
            
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive_json(self, content):
        msg_type = content.get('type')
        user_id = content.get('userId')
        name = content.get('name')

        if msg_type == 'join':
            self.user_id = user_id
            
            # Update state manager
            state_manager.update_participant(
                meeting_id=self.meeting_id,
                user_id=user_id,
                name=name
            )

            # Retrieve active participants
            parts = state_manager.get_participants(self.meeting_id)
            participants_list = []
            for p_id, p_info in parts.items():
                participants_list.append({
                    'userId': p_id,
                    'name': p_info['name'],
                    'isSelf': p_id == user_id
                })

            # Send back current list of participants to the joiner
            await self.send_json({
                'type': 'participants',
                'participants': participants_list
            })

            # Broadcast participant-joined to others
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_meeting_event',
                    'payload': {
                        'type': 'participant-joined',
                        'participant': {
                            'userId': user_id,
                            'name': name,
                            'isSelf': False
                        }
                    }
                }
            )
        else:
            # General screen-share or WebRTC signaling
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_meeting_event',
                    'payload': content
                }
            )

    async def broadcast_meeting_event(self, event):
        payload = event['payload']
        # Don't echo WebRTC or share events back to the sender
        if payload.get('userId') != self.user_id:
            await self.send_json(payload)
