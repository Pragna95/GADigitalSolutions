from .redis_audio import redis_client

def update_mic(room_id, user_id, state):
    redis_client.hset(
        f"room:{room_id}",
        f"{user_id}:mic",
        str(state)
    )