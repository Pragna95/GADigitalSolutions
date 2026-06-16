from livekit import api

LIVEKIT_API_KEY = "huddlekey"
LIVEKIT_API_SECRET = "your-secret"

def generate_token(user_id, room_name):
    token = api.AccessToken(
        LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET
    )

    token.with_identity(user_id)

    token.with_grants(
        api.VideoGrants(
            room_join=True,
            room=room_name
        )
    )

    return token.to_jwt()