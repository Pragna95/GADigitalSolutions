# Huddle Multi-App and Shared Microservice System

This system comprises two separate user-facing client applications (`app1` and `app2`) and a shared `microservices` Django backend containing the core business logic.

API Key-based authentication is used to authenticate client applications communicating with the shared `microservices` container.

---

## Directory Structure

```text
GADigitalSolutions
├── app1/
│   ├── backend1/        # Django App running on Port 5000
│   └── frontend1/       # React (Vite) App running on Port 3000
├── app2/
│   ├── backend2/        # Django App running on Port 8002
│   └── frontend2/       # React (Vite) App running on Port 3001 (Port 3001)
└── microservices/       # Shared Django service running on Port 8000
```

*Note: `frontend1` and `frontend2` have identical files, assets, routing, and configurations.*

---

## Initial Database Setup & Seeding

Before running the client apps, ensure migrations have been applied and the host accounts are seeded.

### 1. Run migrations for microservices:
```bash
cd microservices
.\venv\Scripts\python.exe manage.py makemigrations meetings
.\venv\Scripts\python.exe manage.py migrate
```

### 2. Seed host accounts for microservices:
Run the seed command to create `huddle@demo.com`, `zoom@demo.com`, and `meet@demo.com` (all password `"host123"`):
```bash
.\venv\Scripts\python.exe manage.py seed_hosts
```

---

## Command Reference (Run in 5 Separate Terminals)

### Terminal 1: Shared Microservices Backend (Port 8000)
```bash
cd microservices
.\venv\Scripts\python.exe manage.py runserver 8000
```

### Terminal 2: App 1 Backend (Port 5000)
```bash
cd app1/backend1
python manage.py runserver 5000
```

### Terminal 3: App 2 Backend (Port 8002)
```bash
cd app2/backend2
python manage.py runserver 8002
```

### Terminal 4: App 1 Frontend (Port 3000)
```bash
cd app1/frontend1
npm start
```

### Terminal 5: App 2 Frontend (Port 3001)
```bash
cd app2/frontend2
PORT=3001 npm start
```

---

## Step-by-Step Host Dashboard Walkthrough (Same for Port 3000 and 3001)

### 1. Access Host Login Page
1. Open your browser and navigate to `http://localhost:3000/company/login` (App 1) or `http://localhost:3001/company/login` (App 2).
2. Log in using one of the seeded host accounts:
   - **Email:** `huddle@demo.com`
   - **Password:** `host123`
3. Upon authentication, the backend validates your credentials and returns a JWT token. The client saves this token in `localStorage`.

### 2. Manage API Keys in /company/dashboard
1. On successful login, you are automatically redirected to `http://localhost:3000/company/dashboard` or `http://localhost:3001/company/dashboard`.
2. The page calls `GET /company/api-key` using the JWT token in the `Authorization` header.
3. The dashboard renders the **API Key Manager**:
   - The token input displays the masked key as `sk_live_****3bb8` by default.
   - Click the **Show/Hide Eye Icon** to toggle visibility of the key.
   - Click the **Copy** button to copy the API Key (triggers a toast notification).
   - Click **Regenerate Key** to instantly revoke the old key and create a new one. This prompts for confirmation first and displays a toast on success.

### 3. Verify Axios Request Interceptor Injection
- The Axios interceptor automatically appends the `x-api-key` header to any requests made by developers to the shared microservices at `http://localhost:8000/api/*` whenever `localStorage.api_key` exists.
