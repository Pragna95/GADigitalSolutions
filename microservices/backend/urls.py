from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse

def home(request):
    return HttpResponse("API is running")

# urlpatterns = [
#     # Base URL health check
#     path("", home, name='home'), 
    
#     # Django Admin
#     path('admin/', admin.site.urls),
    
#     # App API Routers
#     path('api/meetings/', include('apps.meetings.urls')),
# ]
urlpatterns = [
    path("", home, name="home"),
    path("admin/", admin.site.urls),

    path("api/", include("apps.meetings.urls")),
]