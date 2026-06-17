import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
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

/* -----------------------------
   Protected Route
----------------------------- */
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");

  return token ? children : <Navigate to="/login" replace />;
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

          {/* Meetings */}

          <Route path="/meeting" element={<Meeting />} />

          {/* New professional format */}
          <Route
            path="/:meetingCode/:apiKey/:meetingId"
            element={<MeetingLobby />}
          />

          <Route
            path="/:meetingCode/:meetingId"
            element={<MeetingLobby />}
          />

          {/* Legacy links */}
          <Route
            path="/meeting/:company/:api_key/:meeting_id"
            element={<MeetingLobby />}
          />

          <Route
            path="/meeting/:company/:letter/:api_key/:meeting_id"
            element={<MeetingLobby />}
          />

          <Route
            path="/lobby/:meeting_id"
            element={<MeetingLobby />}
          />

          <Route
            path="/room/:meeting_id"
            element={<Meeting />}
          />

          <Route
            path="/audio/:meeting_id"
            element={<MeetingRoom />}
          />
          <Route path="/thank-you" element={<ThankYou />} />

          {/* Protected Routes */}


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

          {/* Misc */}
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;