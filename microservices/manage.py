import os
import sys
import asyncio

def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

    # Using SelectorEventLoop on Windows under Python 3.12+ is deprecated and causes TimeoutError reading from Redis.
    # We let Python default to WindowsProactorEventLoopPolicy instead.
    # if sys.platform == 'win32':
    #     asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()