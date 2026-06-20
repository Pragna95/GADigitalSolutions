import os
import urllib.parse as urlparse
from dotenv import load_dotenv

load_dotenv()
database_url = os.getenv("DATABASE_URL")
print("DATABASE_URL:", database_url)
if database_url:
    url = urlparse.urlparse(database_url)
    print("USER:", url.username)
    print("PASSWORD:", url.password)
    print("HOST:", url.hostname)
    print("PORT:", url.port)
    print("PATH:", url.path)
