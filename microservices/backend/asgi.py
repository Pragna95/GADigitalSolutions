import os
import sys

# Set environment variable BEFORE importing components that load Django configurations
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from apps.meetings.routing import websocket_urlpatterns

# Windows Asyncio configuration warning fix:
# Using SelectorEventLoop on Windows under Python 3.12+ can cause TimeoutError with Redis.
# We explicitly let Python default to WindowsProactorEventLoopPolicy instead.
# if sys.platform == 'win32':
#     import asyncio
#     asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})