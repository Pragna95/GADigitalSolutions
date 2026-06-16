import redis
import json

redis_client = redis.Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=True
)

class ParticipantRedisService:

    @staticmethod
    def update_status(participant_id, data):
        key = f"participant:{participant_id}"
        redis_client.set(key, json.dumps(data))

    @staticmethod
    def get_status(participant_id):
        key = f"participant:{participant_id}"
        data = redis_client.get(key)
        if data:
            return json.loads(data)
        return None