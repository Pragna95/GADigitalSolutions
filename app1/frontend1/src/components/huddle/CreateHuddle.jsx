import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Video, Plus, Calendar, Zap, Copy, Share2, ExternalLink, Mail, Check, Users } from "lucide-react";
import AdvanceSchedule from "@/components/schedule/AdvanceSchedule";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { microserviceApi } from "@/services/api";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

export default function CreateHuddle({ onAddSession, onCancelSession }) {
  const [openSchedule, setOpenSchedule] = useState(false);
  const [showInstantModal, setShowInstantModal] = useState(false);
  const [showInstantSetupModal, setShowInstantSetupModal] = useState(false);
  const [instantTitle, setInstantTitle] = useState("Instant Huddle");
  const [instantDescription, setInstantDescription] = useState("Quick instant meeting created with one click");
  const [instantMeetingLink, setInstantMeetingLink] = useState("");
  const [instantMeetingId, setInstantMeetingId] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  const navigate = useNavigate();

  const handleInstantMeeting = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const apiKey = import.meta.env.VITE_X_API_KEY || sessionStorage.getItem("api_key") || localStorage.getItem("api_key") || "";

      let userEmail = localStorage.getItem("email") || "host@example.com";
      let userName = localStorage.getItem("name") || "Host User";

      if (token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const decoded = JSON.parse(jsonPayload);
          if (decoded.email) userEmail = decoded.email;
          if (decoded.name) userName = decoded.name;
        } catch (e) {
          console.warn("Could not decode token", e);
        }
      }

      const requestHeaders = {};
      if (apiKey) {
        requestHeaders["X-Api-Key"] = apiKey;
      }

      const response = await microserviceApi.post("/api/meeting/schedule/", {
        email: userEmail,
        name: userName,
        title: instantTitle,
        description: instantDescription,
        datetime: new Date().toISOString(),
        participant_emails: [],
      }, {
        headers: requestHeaders,
      });

      if (response.status === 201) {
        const data = response.data;
        const company = "huddle";
        const letter = "a";
        const keyToUse = apiKey || "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8";
        const meetingId = data.meeting_id;
        
        const path = data.meeting_path || `/${company}/${letter}/${keyToUse}/${meetingId}`;
        const fullLink = `${window.location.origin}${path}`;

        setInstantMeetingLink(fullLink);
        setInstantMeetingId(meetingId);
        setShowInstantSetupModal(false);
        setShowInstantModal(true);
        toast.success("Instant meeting created!");
      } else {
        toast.error("Failed to create instant meeting");
      }
    } catch (error) {
      console.error("Error creating instant meeting:", error);
      toast.error("Failed to create instant meeting");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(instantMeetingLink);
      setCopied(true);
      toast.success("Meeting link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy link");
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    const rawInput = inviteEmail.trim();
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
      setInviting(true);
      const apiKey = import.meta.env.VITE_X_API_KEY || sessionStorage.getItem("api_key") || localStorage.getItem("api_key") || "";
      const invitePromises = emails.map(async (singleEmail) => {
        return microserviceApi.post(
          "/api/meeting/invite/",
          {
            meeting_id: instantMeetingId,
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
      setInviteEmail("");
    } catch (err) {
      console.error(err);
      toast.error("Error sending invitation(s)");
    } finally {
      setInviting(false);
    }
  };

  const handleJoinInstant = () => {
    try {
      const url = new URL(instantMeetingLink);
      navigate(url.pathname);
    } catch (e) {
      navigate(`/lobby/${instantMeetingId}`);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-br from-[#002266] via-[#002266] to-[#0a1e4d] rounded-2xl p-5 text-white shadow-[0_10px_30px_rgba(0,34,102,0.12)] hover:shadow-[0_12px_40px_rgba(0,34,102,0.22)] transition-all duration-300">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Video className="w-5 h-5 text-blue-300 animate-bounce-subtle" />
          <h2 className="font-bold text-lg">Create a Huddle</h2>
        </div>

        <p className="text-blue-200 text-sm mb-4">
          You can schedule your customized huddle at any time.
        </p>

        {/* Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full bg-white text-black border-white hover:bg-gray-50 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-md rounded-xl font-bold flex items-center justify-center gap-2 h-11 transition-all duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-black" />
              CREATE A MEET
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
  align="center"
  sideOffset={10}
  className="
    w-[var(--radix-dropdown-menu-trigger-width)]
    rounded-3xl
    border border-slate-200/70
    bg-white
    shadow-[0_20px_60px_rgba(0,0,0,0.18)]
    p-3
    animate-in fade-in-0 zoom-in-95
  "
>
  {/* Title */}
  <div className="px-3 py-2 border-b mb-2">
    <p className="font-bold text-gray-800 text-sm">
      Create a new meeting
    </p>
    <p className="text-xs text-gray-500">
      Choose how you want to start
    </p>
  </div>

  {/* Instant Meeting */}
  <DropdownMenuItem
    onClick={() => {
      setInstantTitle("Instant Huddle");
      setInstantDescription("Quick instant meeting created with one click");
      setShowInstantSetupModal(true);
    }}
    className="
      rounded-2xl
      p-4
      cursor-pointer
      hover:bg-[#eef2ff]
      transition-all
      flex items-center gap-4
      mb-2
    "
  >
    <div className="p-3 bg-[#e0e7ff] rounded-2xl shadow-sm">
      <Zap className="w-5 h-5 text-[#1e2b72]" />
    </div>

    <div>
      <p className="font-semibold text-gray-800">
        Instant Meeting
      </p>
      <p className="text-xs text-gray-500">
        Start right now with custom details
      </p>
    </div>
  </DropdownMenuItem>

  {/* Scheduled Meeting */}
  <DropdownMenuItem
    onClick={() => setOpenSchedule(true)}
    className="
      rounded-2xl
      p-4
      cursor-pointer
      hover:bg-[#eef2ff]
      transition-all
      flex items-center gap-4
    "
  >
    <div className="p-3 bg-[#e0e7ff] rounded-2xl shadow-sm">
      <Calendar className="w-5 h-5 text-[#1e2b72]" />
    </div>

    <div>
      <p className="font-semibold text-gray-800">
        Scheduled Meeting
      </p>
      <p className="text-xs text-gray-500">
        Plan and invite attendees
      </p>
    </div>
  </DropdownMenuItem>
</DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Advanced schedule dialog */}
      <AdvanceSchedule
        open={openSchedule}
        setOpen={setOpenSchedule}
        onAddSession={onAddSession}
        onCancelSession={onCancelSession}
      />

      {/* Setup Instant Meeting Details Modal */}
      <Dialog open={showInstantSetupModal} onOpenChange={setShowInstantSetupModal}>
        <DialogContent className="w-[480px] max-w-[90vw] p-6 bg-white border border-slate-100 rounded-3xl shadow-2xl animate-scale-in text-slate-800">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b">
              <div className="p-2.5 bg-[#e0e7ff] rounded-2xl shadow-sm text-[#1e2b72]">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  Instant Meeting Details
                </h2>
                <p className="text-xs text-slate-400 font-semibold">
                  Provide a title and description for your instant meeting.
                </p>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleInstantMeeting(); }} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Meeting Title</label>
                <input
                  type="text"
                  required
                  value={instantTitle}
                  onChange={(e) => setInstantTitle(e.target.value)}
                  className="w-full px-3.5 h-11 border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 rounded-xl text-sm outline-none transition-all duration-200 bg-white font-medium"
                  placeholder="e.g. Quick Standup"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Description</label>
                <textarea
                  value={instantDescription}
                  onChange={(e) => setInstantDescription(e.target.value)}
                  rows={3}
                  className="w-full p-3.5 border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 rounded-xl text-sm outline-none transition-all duration-200 bg-white font-medium resize-none"
                  placeholder="Describe your meeting..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 py-5 rounded-2xl font-bold border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-98 transition-all cursor-pointer text-sm"
                  onClick={() => setShowInstantSetupModal(false)}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#1e2b72] hover:bg-[#152060] text-white py-5 rounded-2xl font-bold shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer text-sm disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create Meeting"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Google Meet-Style Instant Meeting Modal */}
      <Dialog open={showInstantModal} onOpenChange={setShowInstantModal}>
        <DialogContent className="w-[480px] max-w-[90vw] p-6 bg-white border border-slate-100 rounded-3xl shadow-2xl animate-scale-in text-slate-800">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-[#1e2b72] border border-indigo-100/60 shadow-sm animate-bounce-subtle">
              <Video className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Here's the link to your meeting
              </h2>
              <p className="text-xs text-slate-500 font-medium max-w-sm">
                Copy this link and send it to people you want to meet with. Make sure you save it so you can use it later, too.
              </p>
            </div>

            <div className="w-full flex items-center gap-2 p-2.5 bg-slate-50 rounded-2xl border border-slate-200/60 shadow-inner">
              <input
                type="text"
                readOnly
                value={instantMeetingLink}
                className="flex-1 min-w-0 bg-transparent text-xs font-mono text-slate-600 select-all outline-none pl-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-xs px-3 h-8 rounded-xl border-slate-200 hover:bg-indigo-50/50 hover:text-[#1e2b72] active:scale-95 transition-all duration-200 font-semibold cursor-pointer flex items-center gap-1.5"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-500 animate-scale-in" />
                    <span className="text-green-600 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>

            <div className="h-px bg-slate-100 w-full my-2" />

            <form onSubmit={handleSendInvite} className="w-full space-y-2">
              <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider text-left block pl-1">
                Add others by email
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Invite emails (separated by commas)..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full pl-9 pr-4 h-10 border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 rounded-xl text-xs outline-none transition-all duration-200 bg-white"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={inviting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 h-10 text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {inviting ? "Inviting..." : "Invite"}
                </Button>
              </div>
            </form>

            <div className="h-px bg-slate-100 w-full my-2" />

            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1 py-5 rounded-2xl font-bold border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-98 transition-all cursor-pointer text-sm"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Join my Huddle Meeting',
                      text: 'Click the link to join my huddle meeting',
                      url: instantMeetingLink,
                    }).catch(console.error);
                  } else {
                    toast("Native sharing not supported. You can copy the link or invite via email.", { icon: "ℹ️" });
                  }
                }}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share link
              </Button>

              <Button
                className="flex-1 bg-[#1e2b72] hover:bg-[#152060] text-white py-5 rounded-2xl font-bold shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer text-sm"
                onClick={handleJoinInstant}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Join meeting
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}