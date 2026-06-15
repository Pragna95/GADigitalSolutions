import os
import sys
import asyncio

# Using SelectorEventLoop on Windows under Python 3.12+ is deprecated and causes TimeoutError reading from Redis.
# We let Python default to WindowsProactorEventLoopPolicy instead.
# if sys.platform == 'win32':
#     asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import apps.meetings.routing

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(
            apps.meetings.routing.websocket_urlpatterns
        )
    ),
})