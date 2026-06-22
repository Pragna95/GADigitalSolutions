import React, { useState } from "react";
import ChatList from "../chat/ChatList";
import SessionCard from "./SessionCard";
import CreateHuddle from "./CreateHuddle";
import ScheduledMeetings from "./ScheduledMeetings";
import MiniCalendar from "../calender/MiniCalender";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Search, Filter, Check, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { microserviceApi } from "@/services/api";

const TABS = ["Ongoing", "Scheduled", "Completed"];

const sessions = [];
import { useNavigate } from "react-router-dom";




export default function HuddlePage() {
  const [sessionsList, setSessionsList] = useState(sessions);
  const [activeTab, setActiveTab] = useState("Ongoing");
  const [ongoingFilter, setOngoingFilter] = useState("All"); // "All", "Instant", "Scheduled"
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedMeetings, setSelectedMeetings] = useState(new Set());

  const handleToggleSelect = (meetingId) => {
    setSelectedMeetings((prev) => {
      const next = new Set(prev);
      if (next.has(meetingId)) {
        next.delete(meetingId);
      } else {
        next.add(meetingId);
      }
      return next;
    });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedMeetings(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedMeetings.size === 0) return;

    if (!window.confirm(`Are you sure you want to delete the ${selectedMeetings.size} selected instant meeting(s)?`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const apiKey = import.meta.env.VITE_X_API_KEY || sessionStorage.getItem("api_key") || localStorage.getItem("api_key") || "";
      const headers = {
        "Content-Type": "application/json"
      };
      if (token && token !== "null" && token !== "undefined") {
        headers["Authorization"] = `Bearer ${token}`;
      }
      if (apiKey && apiKey !== "null" && apiKey !== "undefined") {
        headers["x-api-key"] = apiKey;
      }

      const res = await microserviceApi.delete("/api/meetings/", {
        headers,
        data: {
          meeting_ids: Array.from(selectedMeetings)
        }
      });

      if (res.status === 200) {
        toast.success(res.data?.message || "Meetings deleted successfully");
        setSelectedMeetings(new Set());
        setRefreshTrigger((prev) => prev + 1);
      } else {
        toast.error("Failed to delete meetings");
      }
    } catch (err) {
      console.error("Error deleting meetings", err);
      toast.error("Error deleting meetings");
    }
  };
  const [meetingId, setMeetingId] = useState("");
  const [pendingSession, setPendingSession] = useState(null);
  const [statusDialog, setStatusDialog] = useState({
    isOpen: false,
    type: "success",
    message: "",
    link: ""
  });

  const parseMeetingIdentifier = (input) => {
    let path = input.trim();
    if (path.includes("http://") || path.includes("https://")) {
      try {
        const url = new URL(path);
        path = url.pathname;
      } catch (e) {
        // Fallback
      }
    }
    const parts = path.replace(/^\/|\/$/g, "").split("/");
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
    return null;
  };

  const handleJoinSession = async () => {
    const input = meetingId.trim();

    if (!input) {
      toast.error("Please enter a meeting link or code");
      return;
    }

    const identifier = parseMeetingIdentifier(input);

    if (!identifier) {
      toast.error("Invalid meeting link or code");
      return;
    }

    try {
      // Validate with backend
      const res = await microserviceApi.get(
        `/api/meeting/validate-lobby/${identifier}/`
      );

      if (res.status === 200 && res.data?.id) {
        const company = res.data.company || "huddle";
        const apiKey = res.data.api_key || "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8";
        // Exact format: company/letter/api_key/meeting_id
        navigate(`/${company}/a/${apiKey}/${res.data.id}`);
      } else {
        toast.error("Meeting not found or expired");
      }
    } catch (err) {
      console.error(err);
      toast.error("Meeting not found or invalid link");
    }
  };
  const handleAddSession = (meetingDetails) => {
    const newSession = {
      id: Date.now(),
      project: "PROJECT STARLIGHT",
      title: meetingDetails.title,
      description:
        meetingDetails.description || "No description provided.",
      time: `${meetingDetails.startTime} – ${meetingDetails.endTime}`,
      participants: meetingDetails.participants || 4,
      status: "Scheduled",
      date: meetingDetails.startDate,
    };

    setPendingSession(newSession);
    setRefreshTrigger((prev) => prev + 1);
    setActiveTab("Scheduled");

    setStatusDialog({
      isOpen: true,
      type: "success",
      message: "Meeting created successfully.",
      link: meetingDetails.link || "",
    });
  };
  const handleCancelSession = () => {
    if (!pendingSession) return;

    setSessionsList((prev) => prev.filter((s) => s.id !== pendingSession.id));
    setPendingSession(null);

    setStatusDialog({
      isOpen: true,
      type: "cancelled",
      message: "Your meeting has been cancelled."
    });
  };

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [dbMeetings, setDbMeetings] = useState([]);

  useEffect(() => {
    const fetchDbMeetings = async () => {
      try {
        const token = localStorage.getItem("token");
        const apiKey = import.meta.env.VITE_X_API_KEY || sessionStorage.getItem("api_key") || localStorage.getItem("api_key") || "";
        const headers = {};
        if (token && token !== "null" && token !== "undefined") {
          headers["Authorization"] = `Bearer ${token}`;
        }
        if (apiKey && apiKey !== "null" && apiKey !== "undefined") {
          headers["x-api-key"] = apiKey;
        }
        const email = localStorage.getItem("email");
        const params = {};
        if (email) {
          params["email"] = email;
        }
        const res = await microserviceApi.get("/api/meetings/", { headers, params });
        if (res.data) {
          setDbMeetings(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch meetings in HuddlePage", err);
      }
    };
    fetchDbMeetings();
  }, [refreshTrigger]);

  const ongoingDbSessions = dbMeetings
    .filter(m => {
      const userEmail = localStorage.getItem("email");
      const cutoff = sessionStorage.getItem("instant_meeting_cutoff");
      
      const isInstant = m.title === "Instant Huddle";
      const isNewInstant = isInstant && (!cutoff || (m.created_at && new Date(m.created_at) >= new Date(cutoff)));
      
      const isInstantOngoing = isInstant &&
                               isNewInstant &&
                               !m.is_completed &&
                               m.created_by_email?.toLowerCase() === userEmail?.toLowerCase();
      const isScheduledOngoing = m.title !== "Instant Huddle" && m.is_ongoing;
      return isInstantOngoing || isScheduledOngoing;
    })
    .map(m => ({
      id: m.id,
      project: "PROJECT STARLIGHT",
      title: m.title,
      description: m.description || (m.title === "Instant Huddle" ? "Quick instant meeting." : "Active scheduled huddle."),
      time: m.is_ongoing ? "Live Now" : "Ready to Join",
      participants: m.active_participants_count || m.participants?.length || 0,
      status: "Ongoing",
      link: m.link,
      isDatabase: true
    }));

  const completedDbSessions = dbMeetings
    .filter(m => m.is_completed)
    .map(m => ({
      id: m.id,
      project: "PROJECT STARLIGHT",
      title: m.title,
      description: m.description || "Completed huddle session.",
      time: m.datetime ? new Date(m.datetime).toLocaleDateString() : "Ended",
      participants: m.participants?.length || 0,
      status: "Completed",
      link: m.link,
      isDatabase: true
    }));

  const placeholders = sessionsList.filter((s) => s.status === activeTab);
  const dbItems = activeTab === "Ongoing" ? ongoingDbSessions : (activeTab === "Completed" ? completedDbSessions : []);
  
  let filteredSessions = [...dbItems, ...placeholders];
  if (activeTab === "Ongoing") {
    if (ongoingFilter === "Instant") {
      filteredSessions = filteredSessions.filter(s => s.title === "Instant Huddle" || s.title === "Instant Meeting");
    } else if (ongoingFilter === "Scheduled") {
      filteredSessions = filteredSessions.filter(s => s.title !== "Instant Huddle" && s.title !== "Instant Meeting");
    }
  }

  const location = useLocation();

  const [showThankYouDialog, setShowThankYouDialog] = useState(false);

  useEffect(() => {
    if (location.state?.showThankYouDialog) {
      setShowThankYouDialog(true);
    }
  }, [location.state]);

  useEffect(() => {
    if (!sessionStorage.getItem("instant_meeting_cutoff")) {
      sessionStorage.setItem("instant_meeting_cutoff", new Date().toISOString());
    }
  }, []);
  const navigate = useNavigate();


  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Sidebar */}
      <ChatList />

      {/* Middle Section */}
      <main className="flex flex-col flex-grow bg-white p-6 overflow-y-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Huddle</h1>
        <p className="text-gray-500 text-sm mb-5">
          Manage your workspace and upcoming sessions.
        </p>

        {/* Meeting ID input */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              placeholder="Enter Meeting ID (e.g. 123-456-7)"
              className="pl-9 border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-lg h-10 text-sm outline-none transition-all duration-200"
            />
          </div>
          <Button
            onClick={handleJoinSession}
            className="bg-[#1e2b72] hover:bg-[#152060] hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 text-white rounded-lg px-5 font-medium transition-all duration-200 cursor-pointer"
          >
            Join Session
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between mb-4 border-b border-gray-100">
          <div className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`text-sm font-semibold pb-2 relative transition-all duration-300 cursor-pointer ${activeTab === tab
                  ? "text-[#1e2b72] scale-105"
                  : "text-gray-500 hover:text-[#1e2b72]"
                  }`}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1e2b72] rounded-full animate-fade-in" />
                )}
              </button>
            ))}
          </div>
          
          {activeTab === "Ongoing" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteSelected}
                disabled={selectedMeetings.size === 0}
                className={`flex items-center justify-center h-9 w-9 rounded-xl border transition-all shadow-sm active:scale-95 cursor-pointer ${
                  selectedMeetings.size > 0
                    ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300 hover:scale-105"
                    : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-50"
                }`}
                title="Delete Selected Instant Meetings"
              >
                <Trash2 className="size-4 text-red-500" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="group text-xs text-slate-600 hover:text-[#1e2b72] hover:border-[#1e2b72]/30 flex items-center gap-1.5 cursor-pointer transition-all border border-slate-200 px-3.5 py-2 rounded-xl bg-white shadow-sm font-bold active:scale-95 duration-200">
                    <Filter className="size-3.5 text-indigo-500 group-hover:scale-110 transition-transform duration-200" />
                    <span>Filter ⚙</span>
                    {ongoingFilter !== "All" && (
                      <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-black ml-1 animate-scale-in">
                        {ongoingFilter}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-scale-in">
                  <DropdownMenuItem
                    onClick={() => setOngoingFilter("All")}
                    className="flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer hover:bg-indigo-50/50 text-xs font-semibold text-slate-700 hover:text-[#1e2b72] outline-none"
                  >
                    <span>All Ongoing</span>
                    {ongoingFilter === "All" && <Check className="size-3.5 text-[#1e2b72]" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setOngoingFilter("Instant")}
                    className="flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer hover:bg-indigo-50/50 text-xs font-semibold text-slate-700 hover:text-[#1e2b72] outline-none"
                  >
                    <span>Instant Only</span>
                    {ongoingFilter === "Instant" && <Check className="size-3.5 text-[#1e2b72]" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setOngoingFilter("Scheduled")}
                    className="flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer hover:bg-indigo-50/50 text-xs font-semibold text-slate-700 hover:text-[#1e2b72] outline-none"
                  >
                    <span>Scheduled Only</span>
                    {ongoingFilter === "Scheduled" && <Check className="size-3.5 text-[#1e2b72]" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {activeTab !== "Ongoing" && (
            <button className="group text-xs text-slate-400 hover:text-slate-500 flex items-center gap-1.5 transition-all border border-slate-200 px-3.5 py-2 rounded-xl bg-gray-50/50 cursor-not-allowed font-bold opacity-60">
              <Filter className="size-3.5 text-slate-400" />
              <span>Filter ⚙</span>
            </button>
          )}
        </div>

        {/* Session Cards */}
        <div className="animate-fade-in">
          {activeTab === "Scheduled" ? (
            <ScheduledMeetings refreshTrigger={refreshTrigger} />
          ) : filteredSessions.length > 0 ? (
            <div className="flex flex-col gap-4 max-h-[450px] overflow-y-auto pr-2 no-scrollbar">
              {filteredSessions.map((s) => {
                const isInstant = s.title === "Instant Huddle" || s.title === "Instant Meeting";
                return (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
                    isSelected={selectedMeetings.has(s.id)}
                    onToggleSelect={isInstant && activeTab !== "Completed" ? () => handleToggleSelect(s.id) : undefined}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm italic">No sessions found.</p>
          )}
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="w-full max-w-[480px] md:w-[480px] bg-gray-50 border-l border-gray-100 p-5 flex flex-col gap-5 overflow-y-auto flex-shrink-0 transition-all duration-300">
        <CreateHuddle onAddSession={handleAddSession} onCancelSession={handleCancelSession} />
        <MiniCalendar />
      </aside>

      {/* Reusable Status Dialog (Success / Cancelled) */}
      <Dialog open={statusDialog.isOpen} onOpenChange={(val) => setStatusDialog(prev => ({ ...prev, isOpen: val }))}>
        <DialogContent className="w-[450px] p-6 bg-white border border-gray-100 rounded-2xl shadow-xl animate-scale-in max-w-[90vw]">
          <div className="flex flex-col items-center text-center p-4">
            {showCancelConfirm ? (
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4 text-amber-500 shadow-sm border border-amber-100">
                <svg className="w-8 h-8 animate-bounce-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            ) : statusDialog.type === "success" ? (
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4 text-green-500 shadow-sm border border-green-100">
                <svg className="w-8 h-8 animate-bounce-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-500 shadow-sm border border-red-100">
                <svg className="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}

            <h2 className="text-xl font-extrabold text-gray-900 mb-2">
              {statusDialog.type === "success" ? "Meeting Created!" : "Meeting Cancelled"}
            </h2>

            <p className="text-sm text-gray-500 mb-4 font-medium">
              {showCancelConfirm ? "Are you sure you want to cancel this meeting?" : statusDialog.message}
            </p>

            <div className="w-full">
              {showCancelConfirm ? (
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    No, Keep Meeting
                  </Button>

                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => {
                      setPendingSession(null);
                      setShowCancelConfirm(false);

                      setStatusDialog({
                        isOpen: true,
                        type: "cancelled",
                        message: "Your meeting has been cancelled.",
                        link: ""
                      });
                    }}
                  >
                    Yes, Cancel Meeting
                  </Button>
                </div>
              ) : statusDialog.type === "success" ? (
                <div className="flex flex-col gap-3 w-full">
                  {statusDialog.link && (
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 mb-1">
                      <input
                        type="text"
                        readOnly
                        value={statusDialog.link}
                        className="flex-1 min-w-0 bg-transparent text-xs font-mono text-slate-600 select-all outline-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs px-2.5 h-7 rounded-lg border-slate-200 hover:bg-indigo-50"
                        onClick={() => navigator.clipboard.writeText(statusDialog.link)}
                      >
                        Copy
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-3 w-full">
                    <Button
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 py-3 rounded-xl font-bold"
                      onClick={() => setShowCancelConfirm(true)}
                    >
                      Cancel Meeting
                    </Button>

                    <Button
                      className="flex-1 bg-[#1e2b72] hover:bg-[#152060] text-white py-3 rounded-xl font-bold shadow-md"
                      onClick={() => {
                        if (pendingSession) {
                          setSessionsList((prev) => [...prev, pendingSession]);
                          setPendingSession(null);
                        }
                        setStatusDialog((prev) => ({
                          ...prev,
                          isOpen: false,
                        }));
                      }}
                    >
                      View Scheduled
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-bold shadow-md transition-all duration-200 cursor-pointer active:scale-98"
                  onClick={() =>
                    setStatusDialog((prev) => ({
                      ...prev,
                      isOpen: false,
                    }))
                  }
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showThankYouDialog} onOpenChange={setShowThankYouDialog}>
        <DialogContent className="w-[500px] p-0 bg-white border border-gray-200 rounded-xl shadow-md">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Thank you for joining
            </h2>

            <p className="text-sm text-gray-500 mb-6">
              Your huddle has ended successfully. Would you like to join another session?
            </p>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                className="border-[#002266] text-[#002266] hover:bg-[#002266] hover:text-white cursor-pointer"
                onClick={() => setShowThankYouDialog(false)}
              >
                Leave
              </Button>

              <Button
                className="bg-[#1E2B72] hover:bg-[#17215A] text-white cursor-pointer"
                onClick={() => {
                  setShowThankYouDialog(false);
                  navigate("/meeting");
                }}
              >
                Join Again
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}