# Shared meeting state for development (in-memory)

class MeetingStateManager:
    def __init__(self):
        # meeting_id -> { user_id -> { user_id, name, is_mic_on, is_video_on, hand_raised } }
        self.participants = {}
        # meeting_id -> { user_id, name }
        self.screen_sharers = {}

    def get_participants(self, meeting_id):
        if meeting_id not in self.participants:
            self.participants[meeting_id] = {}
        return self.participants[meeting_id]

    def get_participant(self, meeting_id, user_id):
        parts = self.get_participants(meeting_id)
        return parts.get(user_id)

    def update_participant(self, meeting_id, user_id, name, is_mic_on=None, is_video_on=None, hand_raised=None):
        parts = self.get_participants(meeting_id)
        if user_id not in parts:
            parts[user_id] = {
                "user_id": user_id,
                "name": name,
                "is_mic_on": False,
                "is_video_on": False,
                "hand_raised": False
            }
        
        if is_mic_on is not None:
            parts[user_id]["is_mic_on"] = is_mic_on
        if is_video_on is not None:
            parts[user_id]["is_video_on"] = is_video_on
        if hand_raised is not None:
            parts[user_id]["hand_raised"] = hand_raised
        if name:
            parts[user_id]["name"] = name
            
        return parts[user_id]

    def remove_participant(self, meeting_id, user_id):
        if meeting_id in self.participants and user_id in self.participants[meeting_id]:
            del self.participants[meeting_id][user_id]

    def start_screen_share(self, meeting_link, user_id, name=""):
        self.screen_sharers[meeting_link] = {"user_id": user_id, "name": name}

    def stop_screen_share(self, meeting_link):
        if meeting_link in self.screen_sharers:
            del self.screen_sharers[meeting_link]

    def get_screen_sharer(self, meeting_link):
        return self.screen_sharers.get(meeting_link)

state_manager = MeetingStateManager()
