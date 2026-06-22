import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";

// Pages

import Meeting from "./components/MeetingRoom/Meeting";
import MeetingLobby from "./pages/MeetingLobby";
import LoginAuth from "./pages/LoginAuth";
import SignupAuth from "./pages/SignupAuth";
import AuthReturn from "./pages/AuthReturn";
import ThankYou from "./pages/ThankYou";
import MeetingRoom from "./components/MeetingRoom";

// Layout Components
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

// Feature Components
import HuddlePage from "@/components/huddle/HuddlePage";
import ChatWindow from "@/components/chat/ChatWindow";
import ChatList from "@/components/chat/ChatList";

/* -----------------------------
   Placeholder Pages
----------------------------- */
const Profile = () => (
  <div className="p-8">Profile Page (Placeholder)</div>
);

const Settings = () => (
  <div className="p-8">Settings Page (Placeholder)</div>
);

const NotFound = () => (
  <div className="p-8 mt-20 text-center text-xl font-semibold">
    404 - Page Not Found
  </div>
);

const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch (e) {
    return true;
  }
};

/* -----------------------------
   Protected Route
   ----------------------------- */
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const location = useLocation();

  if (!token || isTokenExpired(token)) {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    localStorage.removeItem("email");
    localStorage.removeItem("name");
    localStorage.removeItem("user_id");

    sessionStorage.setItem(
      "redirect_after_login",
      location.pathname
    );

    return <Navigate to="/login" replace />;
  }

  return children;
};

/* -----------------------------
   Shared Dashboard Layout
----------------------------- */
const DashboardLayout = ({ children, bg = "bg-gray-100" }) => (
  <div className={`flex h-screen overflow-hidden ${bg}`}>
    <Sidebar />

    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar />

      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  </div>
);

/* -----------------------------
   Pages
----------------------------- */
const DashboardUI = () => (
  <DashboardLayout>
    <HuddlePage />
  </DashboardLayout>
);

const Messaging = () => (
  <DashboardLayout bg="bg-[#F8F9FB]">
    <main className="mx-auto flex h-full w-full max-w-[1329px] flex-1 gap-6 overflow-hidden p-4 animate-scale-in">
      <ChatList />
      <ChatWindow />
    </main>
  </DashboardLayout>
);

/* -----------------------------
   App
----------------------------- */
function App() {
  return (
    <>
      <Toaster position="top-right" />

      <Router>
        <Routes>
          {/* Redirect */}
          <Route
            path="/"
            element={<Navigate to="/login" replace />}
          />

          {/* Auth */}
          <Route path="/login" element={<LoginAuth />} />
          <Route path="/signup" element={<SignupAuth />} />
          <Route path="/auth-return" element={<AuthReturn />} />

          {/* Static Pages */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardUI />
              </ProtectedRoute>
            }
          />

          <Route
            path="/message"
            element={
              <ProtectedRoute>
                <Messaging />
              </ProtectedRoute>
            }
          />

          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/thank-you" element={<ThankYou />} />

          <Route
            path="/meeting"
            element={
              <ProtectedRoute>
                <Meeting />
              </ProtectedRoute>
            }
          />

          {/* Specific Parameterized Paths */}
          <Route
            path="/lobby/:meeting_id"
            element={
              <ProtectedRoute>
                <MeetingLobby />
              </ProtectedRoute>
            }
          />

          <Route
            path="/room/:meeting_id"
            element={
              <ProtectedRoute>
                <Meeting />
              </ProtectedRoute>
            }
          />

          <Route
            path="/audio/:meeting_id"
            element={
              <ProtectedRoute>
                <MeetingRoom />
              </ProtectedRoute>
            }
          />

          {/* Parameterized Paths with Static Prefixes */}
          <Route
            path="/meeting/:company/:letter/:api_key/room/:meeting_id"
            element={
              <ProtectedRoute>
                <Meeting />
              </ProtectedRoute>
            }
          />

          <Route
            path="/meeting/:company/:api_key/room/:meeting_id"
            element={
              <ProtectedRoute>
                <Meeting />
              </ProtectedRoute>
            }
          />

          <Route
            path="/meeting/:company/:api_key/:meeting_id"
            element={
              <ProtectedRoute>
                <MeetingLobby />
              </ProtectedRoute>
            }
          />

          <Route
            path="/meeting/:company/:letter/:api_key/:meeting_id"
            element={
              <ProtectedRoute>
                <MeetingLobby />
              </ProtectedRoute>
            }
          />

          {/* Generic Wildcard Parameterized Paths */}
          <Route
            path="/:company/:letter/:api_key/room/:meeting_id"
            element={
              <ProtectedRoute>
                <Meeting />
              </ProtectedRoute>
            }
          />

          <Route
            path="/:company/:letter/:api_key/:meeting_id"
            element={
              <ProtectedRoute>
                <MeetingLobby />
              </ProtectedRoute>
            }
          />

          <Route
            path="/:meetingCode/:apiKey/:meetingId"
            element={
              <ProtectedRoute>
                <MeetingLobby />
              </ProtectedRoute>
            }
          />

          <Route
            path="/:meetingCode/:meetingId"
            element={
              <ProtectedRoute>
                <MeetingLobby />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;