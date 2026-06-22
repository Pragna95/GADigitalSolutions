import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import { Copy, Calendar, Users, RefreshCw, Trash2 } from "lucide-react";
import api, { microserviceApi } from "../../services/api";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
export default function ScheduledMeetings({ refreshTrigger }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const token = localStorage.getItem("token");
  const apiKey = import.meta.env.VITE_X_API_KEY || sessionStorage.getItem("api_key") || localStorage.getItem("api_key") || "";

  const fetchMeetings = async () => {
    try {
      setLoading(true);
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
      const response = await microserviceApi.get("/api/meetings/", {
        headers,
        params,
      });
      // sort by latest date first
      const sortedMeetings = [...response.data].sort((a, b) => {
        return new Date(a.datetime) - new Date(b.datetime);
      });
      // Filter out instant meetings, ongoing meetings, and completed meetings
      const filteredMeetings = sortedMeetings.filter(
        (m) =>
          m.title !== "Instant Huddle" &&
          m.db_status === "scheduled" &&
          !m.is_ongoing &&
          !m.is_completed
      );
      setMeetings(filteredMeetings);
    } catch (err) {
      console.error(err);
      setError("Failed to load scheduled meetings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [refreshTrigger]);

  const handleRowClick = (meeting) => {
    setSelectedMeeting(meeting);
    setIsDialogOpen(true);
  };

  const buildFullLink = (linkText) => {
    if (!linkText) return "";
    if (linkText.startsWith("/")) {
      return `${window.location.origin}${linkText}`;
    }
    return `${window.location.origin}${linkText}`;
  };

  const handleCopyLink = async (linkText) => {
    if (!linkText) return;
    try {
      const fullLink = buildFullLink(linkText);
      await navigator.clipboard.writeText(fullLink);
      toast.success("Copied!", {
        duration: 2000,
      });
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const navigate = useNavigate();

  const handleOpenMeeting = (meeting) => {
    if (!meeting) return;

    const path = meeting.link || `/${meeting.meeting_code}/${meeting.id}`;

    const token = localStorage.getItem("token");

    if (token && token !== "null" && token !== "undefined") {
      navigate(path);
    } else {
      sessionStorage.setItem("pending_meeting", path);
      navigate("/login");
    }
  };

  const handleDeleteMeeting = async (meetingId) => {
    if (!window.confirm("Are you sure you want to delete this scheduled meeting?")) {
      return;
    }
    try {
      const headers = {};
      if (token && token !== "null" && token !== "undefined") {
        headers["Authorization"] = `Bearer ${token}`;
      }
      if (apiKey && apiKey !== "null" && apiKey !== "undefined") {
        headers["x-api-key"] = apiKey;
      }
      const response = await microserviceApi.delete("/api/meetings/", {
        headers,
        params: { meeting_id: meetingId },
        data: { meeting_id: meetingId }
      });
      if (response.status === 200) {
        toast.success("Meeting deleted successfully");
        setIsDialogOpen(false);
        fetchMeetings();
      } else {
        toast.error("Failed to delete meeting");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Error deleting meeting");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-500">
        <RefreshCw className="animate-spin mr-2 size-5 text-[#1e2b72]" />
        <span>Loading meetings...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500 border border-red-100 rounded-xl bg-red-50">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {meetings.length === 0 ? (
        <p className="text-gray-400 text-sm italic p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
          No scheduled meetings found.
        </p>
      ) : (
        <div className="grid gap-4 max-h-[450px] overflow-y-auto pr-2 no-scrollbar">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              onClick={() => handleRowClick(meeting)}
              className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border border-slate-100 hover:border-[#1e2b72]/45 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 cursor-pointer text-left gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-indigo-50 text-[#1e2b72] rounded-xl group-hover:bg-[#1e2b72] group-hover:text-white transition-colors duration-300 shrink-0">
                    <Calendar className="size-5" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight group-hover:text-[#1e2b72] transition-colors truncate">
                      {meeting.title}
                    </h3>
                    {meeting.description ? (
                      <p className="text-xs text-slate-400 font-medium leading-relaxed truncate max-w-sm sm:max-w-md">
                        {meeting.description}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        No description provided.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold pl-11">
                  <span>{dayjs(meeting.datetime).format("MMMM D, YYYY - h:mm A")}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                <div className="flex items-center gap-1.5 bg-indigo-50/70 text-indigo-700 px-3.5 py-1.5 rounded-xl text-[11px] font-bold border border-indigo-100/50 shrink-0">
                  <Users className="size-3.5 text-indigo-500 shrink-0" />
                  <span>{meeting.participants?.length || 0} participants</span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMeeting(meeting.id);
                  }}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-200 cursor-pointer border border-transparent hover:border-red-200"
                  title="Delete Scheduled Meeting"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* shadcn Dialog for Meeting Details */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[500px] p-6 bg-white border border-gray-150 rounded-2xl shadow-xl max-w-[90vw]">
          {selectedMeeting && (
            <div className="space-y-5 text-left">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  {selectedMeeting.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {/* Date & Time */}
                <div className="flex flex-col gap-1 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Date & Time</span>
                  <span className="text-slate-800 font-semibold">{selectedMeeting.datetime}</span>
                </div>

                {/* Participants */}
                <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Participants</span>
                  {selectedMeeting.participants && selectedMeeting.participants.length > 0 ? (
                    <ul className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {selectedMeeting.participants.map((email, idx) => (
                        <li key={idx} className="text-slate-700 font-medium flex items-center gap-2">
                          <span className="size-1.5 bg-indigo-600 rounded-full shrink-0"></span>
                          <span className="text-xs">{email}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-400 italic text-xs">No participants invited.</span>
                  )}

                  {/* Add/Invite Participant directly from scheduled meetings list */}
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="Invite emails (separated by commas)..."
                      id="add-invite-email"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white text-slate-700 font-sans"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        const emailInput = document.getElementById("add-invite-email");
                        const rawInput = emailInput?.value?.trim();
                        if (!rawInput) return;

                        const emails = rawInput
                          .split(",")
                          .map((e) => e.trim())
                          .filter(Boolean);

                        if (emails.length === 0) return;

                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        const invalidEmails = emails.filter((e) => !emailRegex.test(e));
                        if (invalidEmails.length > 0) {
                          toast.error(`Invalid email format: ${invalidEmails.join(", ")}`);
                          return;
                        }

                        try {
                          const invitePromises = emails.map(async (singleEmail) => {
                            return microserviceApi.post(
                              "/api/meeting/invite/",
                              {
                                meeting_id: selectedMeeting.id,
                                email: singleEmail,
                              },
                              {
                                headers: {
                                  "X-Api-Key": apiKey,
                                },
                              }
                            );
                          });

                          await Promise.all(invitePromises);

                          toast.success(`Successfully invited ${emails.length} participant(s)`);
                          if (emailInput) emailInput.value = "";

                          setSelectedMeeting((prev) => ({
                            ...prev,
                            participants: [...(prev.participants || []), ...emails],
                          }));
                          fetchMeetings();
                        } catch (err) {
                          console.error(err);
                          toast.error("Error sending invitations");
                        }
                      }}
                      className="bg-[#1e2b72] hover:bg-[#152060] text-white text-xs h-8 rounded-lg shrink-0 px-3 cursor-pointer"
                    >
                      Add
                    </Button>
                  </div>
                </div>

                {/* Meeting Link */}
                <div className="flex flex-col gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Meeting Link</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={buildFullLink(selectedMeeting.link)}
                      className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-600 select-all outline-none focus:outline-none focus:ring-0 focus-visible:ring-0"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleCopyLink(selectedMeeting.link)}
                      className="bg-[#1e2b72] hover:bg-[#152060] text-white flex items-center gap-1.5 shrink-0 px-3 cursor-pointer h-9 rounded-lg"
                    >
                      <Copy className="size-3.5" />
                      Copy Link
                    </Button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleDeleteMeeting(selectedMeeting.id)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all duration-200 cursor-pointer"
                  title="Delete Meeting"
                >
                  <Trash2 size={18} />
                </button>

                <div className="flex gap-2">
                  <Button
                    onClick={() => { handleOpenMeeting(selectedMeeting); setIsDialogOpen(false); }}
                    className="px-4 h-10 rounded-lg bg-[#1e2b72] hover:bg-[#152060] text-white"
                  >
                    Join / Open
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="px-4 h-10 rounded-lg cursor-pointer border-slate-200 hover:bg-slate-50"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
