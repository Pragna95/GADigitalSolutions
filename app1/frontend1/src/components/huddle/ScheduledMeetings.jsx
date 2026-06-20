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
import { Copy, Calendar, Users, RefreshCw } from "lucide-react";
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
  const apiKey = import.meta.env.VITE_X_API_KEY || localStorage.getItem("api_key") || "";

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
      const response = await microserviceApi.get("/api/meetings/", {
        headers,
      });
      // sort by latest date first
      const sortedMeetings = [...response.data].sort((a, b) => {
        return new Date(a.datetime) - new Date(b.datetime);
      });
      setMeetings(sortedMeetings);
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

    const path = `/${meeting.meeting_code}/${meeting.id}`;

    const token = localStorage.getItem("token");

    if (token && token !== "null" && token !== "undefined") {
      navigate(path);
    } else {
      sessionStorage.setItem("pending_meeting", path);
      navigate("/login");
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
        <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              onClick={() => handleRowClick(meeting)}
              className="flex items-center justify-between p-4 rounded-xl border border-[#1e2b72]/20 hover:border-[#1e2b72] bg-white shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer text-left"
            >
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-gray-900">{meeting.title}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Calendar className="size-3.5 text-indigo-500" />
                  <span>{meeting.datetime}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] font-bold">
                <Users className="size-3 text-indigo-500 shrink-0" />
                <span>{meeting.participants?.length || 0} participants</span>
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
                </div>

                {/* Meeting Link */}
                <div className="flex flex-col gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Meeting Link</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={buildFullLink(selectedMeeting.link)}
                      className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-600 select-all outline-none"
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
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
