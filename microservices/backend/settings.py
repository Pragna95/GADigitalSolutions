from pathlib import Path
import os
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from decouple import config

load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-bqdu)hd=0g_u+qt^n(2u@2ak@=bg#1wk83r0^yg(3m%!b9*g&y')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'True') == 'True'

ALLOWED_HOSTS = ['*']

# Application definition
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django_extensions',

    'rest_framework',
    'django_filters',
    'corsheaders',
    'channels',

    'apps.meetings',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'
ASGI_APPLICATION = 'backend.asgi.application'

import urllib.parse as urlparse

# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases
database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise ValueError("DATABASE_URL environment variable is required. Supabase connection must be configured.")

url = urlparse.urlparse(database_url)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': url.path[1:],
        'USER': url.username,
        'PASSWORD':url.password,
        'HOST': url.hostname,
        'PORT': url.port or 5432,
    }
}
query = urlparse.parse_qs(url.query)
if 'sslmode' in query:
    DATABASES['default']['OPTIONS'] = {
        'sslmode': query['sslmode'][0]
    }
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

EMAIL_HOST = os.environ.get("EMAIL_HOST")
EMAIL_PORT = os.environ.get("EMAIL_PORT")

EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD")

EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS") == "True"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
ALLOWED_HOSTS=['*']
# CORS configuration
from corsheaders.defaults import default_headers
CORS_ALLOW_HEADERS = list(default_headers) + ["x-api-key"]
# Allow specific origins (frontend, backend1, microservices) and ngrok URLs if provided
CORS_ALLOWED_ORIGINS = [
    os.getenv('NGROK_FRONTEND_URL', ''),
]
# Remove empty strings and ensure scheme is present
CORS_ALLOWED_ORIGINS = [origin for origin in CORS_ALLOWED_ORIGINS if origin]
CORS_ALLOW_CREDENTIALS = True

if not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

CSRF_TRUSTED_ORIGINS = [
    'https://*.ngrok-free.dev',
    'http://localhost:3000',
]

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'backend.authentication.ApiKeyAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend"
    ]
}


# Realtime Channels & Cache (Strictly Redis / Memurai)
redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/1")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": redis_url,
        "OPTIONS": {
            "socket_timeout": 30,
            "socket_connect_timeout": 30,
            "retry_on_timeout": True,
            "protocol": 2,
        }
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [{
                "address": redis_url,
                "socket_timeout": 30,
                "socket_connect_timeout": 30,
                "retry_on_timeout": True,
                "protocol": 2,
            }],
        },
    },
}

# Email Backend Settings (reloaded)
# Email configuration: use console backend in DEBUG for local development
if DEBUG:
    EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
else:
    EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')

EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')

# Ensure DEFAULT_FROM_EMAIL is set so send_mail has a valid sender address
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'no-reply@localhost')

# Valid API Keys allowed to connect to microservices
VALID_API_KEYS = os.getenv(
    'VALID_API_KEYS',
    ''
).split(',')

# Frontend configuration – prefer ngrok URL if set
FRONTEND_URL = os.getenv('NGROK_FRONTEND_URL', os.getenv('FrontendURL', 'http://localhost:3000'))

# Redirect URL after successful login
LOGIN_REDIRECT_URL = '/api/super-admin/dashboard/'

# URL where users are redirected for login
LOGIN_URL = '/api/login/'

AUTHENTICATION_BACKENDS = [
    'apps.meetings.auth_backends.EmailOrUsernameModelBackend',
]

# CACHES is defined dynamically above alongside CHANNEL_LAYERS

# LiveKit Server Settings
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "http://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "secret")


