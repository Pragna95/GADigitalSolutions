import React, { useState, useEffect, useRef } from "react";
import { Search, X, SendHorizontal, Mail, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { microserviceApi } from "../../services/api";
import toast from "react-hot-toast";

const apiBaseUrl = import.meta.env.VITE_MICROSERVICE_URL || "http://localhost:8000";

// Derive WebSocket base URL from the browser host — same approach as MeetingRoom/index.jsx.
// This ensures the WS connection goes through the Vite proxy (/ws → :8000) and works
// for every device (localhost, ngrok, LAN IP) without a hardcoded hostname.
const wsBaseUrl = (() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
})();

const INVITE_STORAGE_KEY = (meetingId) => `invited_participants_${meetingId}`;

const Sidebar = ({
    showHandRaise, setShowHandRaise,
    showParticipants, setShowParticipants,
    showMenuPage, setShowMenuPage,
    showAddParticipant, setShowAddParticipant,
    setShowParticipantsGrid,
    handRaiseMembers = [], participantMembers = [],
    liveParticipants = [], userId, participantName,
    meetingId,
}) => {
    const [activeMenu, setActiveMenu] = useState("chat");
    const [message, setMessage] = useState("");
    const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
    const [chatMessages, setChatMessages] = useState([]);
    const [showAll, setShowAll] = useState(false);
    const chatBottomRef = useRef(null);

    // ── Add Participants panel state ──────────────────────────────────────────
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteLoading, setInviteLoading] = useState(false);
    const [invitedList, setInvitedList] = useState([]);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const parsedEmails = inviteEmail.split(",").map((e) => e.trim()).filter(Boolean);

    // Load persisted invited list when panel opens
    useEffect(() => {
        if (showAddParticipant && meetingId) {
            try {
                const stored = localStorage.getItem(INVITE_STORAGE_KEY(meetingId));
                if (stored) setInvitedList(JSON.parse(stored));
            } catch { /* ignore */ }
        }
    }, [showAddParticipant, meetingId]);

    const persistInvited = (list) => {
        try {
            localStorage.setItem(INVITE_STORAGE_KEY(meetingId), JSON.stringify(list));
        } catch { /* ignore */ }
        setInvitedList(list);
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        if (parsedEmails.length === 0) return;

        const invalidEmails = parsedEmails.filter((e) => !emailRegex.test(e));
        if (invalidEmails.length > 0) {
            toast.error(`Invalid email: ${invalidEmails.join(", ")}`);
            return;
        }

        const newEmails = parsedEmails.filter((em) => !invitedList.includes(em));
        if (newEmails.length === 0) {
            toast("All these emails were already invited.", { icon: "ℹ️" });
            setInviteEmail("");
            return;
        }

        setInviteLoading(true);
        try {
            const apiKey =
                import.meta.env.VITE_X_API_KEY ||
                sessionStorage.getItem("api_key") ||
                localStorage.getItem("api_key") ||
                "";

            await Promise.all(
                newEmails.map((singleEmail) =>
                    microserviceApi.post(
                        "/api/meeting/invite/",
                        { meeting_id: meetingId, email: singleEmail },
                        { headers: { "X-Api-Key": apiKey } }
                    )
                )
            );

            toast.success(`Successfully invited ${newEmails.length} participant(s)!`);
            persistInvited([...invitedList, ...newEmails]);
            setInviteEmail("");
        } catch (error) {
            console.error("Invite error:", error);
            toast.error(error.response?.data?.error || "Failed to send invitation(s).");
        } finally {
            setInviteLoading(false);
        }
    };

    const handleRemoveInvited = (emailToRemove) => {
        persistInvited(invitedList.filter((em) => em !== emailToRemove));
    };
    // ─────────────────────────────────────────────────────────────────────────

    const displayParticipants = React.useMemo(() => {
        if (liveParticipants && liveParticipants.length > 0) {
            const list = [];
            list.push(`${participantName || "You"} (You)`);
            liveParticipants.forEach((p) => {
                if (p.user_id !== userId) {
                    const cleanName = p.name ? p.name.replace(/_[a-zA-Z0-9]{5}$/, "") : "Remote User";
                    list.push(cleanName);
                }
            });
            return list;
        }
        return participantMembers || [];
    }, [liveParticipants, participantMembers, participantName, userId]);

    const visibleParticipants = showAll ? displayParticipants : displayParticipants.slice(0, 8);
    const chatSocketRef = useRef(null);

    // Fetch chat history
    useEffect(() => {
        if (!meetingId) return;

        const loadChatHistory = async () => {
            try {
                const response = await fetch(`${apiBaseUrl}/api/chat/${meetingId}/`);
                if (response.ok) {
                    const data = await response.json();
                    const formatted = data.map((msg) => ({
                        sender: msg.user,
                        text: msg.message,
                        user_id: msg.user_id,
                    }));
                    setChatMessages(formatted);
                }
            } catch (err) {
                console.error("Failed to load chat history:", err);
            }
        };

        loadChatHistory();
    }, [meetingId]);

    // Chat WebSocket connection with auto-reconnect
    useEffect(() => {
        if (!meetingId) return;

        let socket = null;
        let reconnectTimeout = null;
        let retryCount = 0;
        const maxRetries = 10;
        let isUnmounted = false;

        const connect = () => {
            if (isUnmounted) return;
            const wsUrl = `${wsBaseUrl}/ws/chat/${meetingId}/`;
            console.log("[ChatWS] Connecting to", wsUrl);
            socket = new WebSocket(wsUrl);
            chatSocketRef.current = socket;

            socket.onopen = () => {
                if (isUnmounted) { socket.close(); return; }
                console.log("[ChatWS] Connected to", wsUrl);
                retryCount = 0;
            };

            socket.onmessage = (event) => {
                if (isUnmounted) return;
                try {
                    const data = JSON.parse(event.data);
                    setChatMessages((prev) => [
                        ...prev,
                        {
                            sender: data.sender || "Unknown",
                            text: data.message,
                            user_id: data.user_id,
                        },
                    ]);
                } catch (err) {
                    console.error("[ChatWS] Failed to parse message", err);
                }
            };

            socket.onerror = (err) => {
                console.warn("[ChatWS] Error", err);
            };

            socket.onclose = (event) => {
                if (isUnmounted) return;
                console.log("[ChatWS] Closed:", event.code, event.reason);
                chatSocketRef.current = null;
                if (retryCount < maxRetries) {
                    retryCount++;
                    const backoff = Math.min(1000 * Math.pow(2, retryCount), 10000);
                    console.log(`[ChatWS] Reconnecting in ${backoff}ms (attempt ${retryCount}/${maxRetries})`);
                    reconnectTimeout = setTimeout(connect, backoff);
                } else {
                    console.error("[ChatWS] Max retries reached. Chat unavailable.");
                }
            };
        };

        connect();

        return () => {
            isUnmounted = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (socket) {
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                }
            }
            chatSocketRef.current = null;
        };
    }, [meetingId]);

    // Auto-scroll chat to bottom whenever new messages arrive
    useEffect(() => {
        if (chatBottomRef.current) {
            chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatMessages]);

    const handleSendMessage = () => {
        if (message.trim() === "") return;

        if (
            chatSocketRef.current &&
            chatSocketRef.current.readyState === WebSocket.OPEN
        ) {
            chatSocketRef.current.send(
                JSON.stringify({
                    user_id: userId,
                    sender: participantName,
                    message: message
                })
            );
            setMessage("");
        } else {
            console.warn("WebSocket is not open");
        }
    };

    if (!showHandRaise && !showParticipants && !showMenuPage && !showAddParticipant) return null;

    return (
        <>
            {/* PARTICIPANTS & HAND RAISE PANEL */}
            {(showHandRaise || showParticipants) && !showMenuPage && (
                <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 flex flex-col h-full shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2">
                            {showHandRaise ? (
                                <>
                                    <span>✋</span>
                                    Hand Raise
                                    {handRaiseMembers.length > 0 && (
                                        <span className="ml-1 bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                                            {handRaiseMembers.length}
                                        </span>
                                    )}
                                </>
                            ) : "Participants"}
                        </h2>
                        <button
                            onClick={() => { setShowHandRaise(false); setShowParticipants(false); }}
                            className="w-6 h-6 border border-slate-350 hover:border-slate-500 rounded flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        >
                            ×
                        </button>
                    </div>

                    <div className="relative mb-4">
                        <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                        <input type="text" placeholder="search" className="w-full border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-xl py-2 pl-9 pr-3 text-sm outline-none" />
                    </div>

                    <div className="space-y-3 overflow-y-auto flex-1">
                        {showHandRaise && handRaiseMembers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-10 gap-3 text-slate-400">
                                <span className="text-4xl opacity-40">✋</span>
                                <p className="text-sm font-medium">No hands raised yet</p>
                            </div>
                        ) : (
                            (showHandRaise ? handRaiseMembers : visibleParticipants).map((member, index) => (
                                <div key={index} className="border border-slate-100 rounded-xl px-3 py-2 flex items-center gap-3 hover:bg-slate-50 cursor-pointer">
                                    {showHandRaise ? (
                                        <div className="w-10 h-10 rounded-[12px] bg-[#ACBFFF] flex items-center justify-center shadow-md shrink-0 relative">
                                            <span className="text-[16px] text-[#394C84]">👤</span>
                                            <span className="absolute -top-1 -right-1 text-[12px]">✋</span>
                                        </div>
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-[#1e2b72] shrink-0">
                                            {member.replace(" (You)", "").substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <span className="text-sm font-semibold text-slate-700">{member}</span>
                                </div>
                            ))
                        )}

                        {/* View All / Show Less inside the scrollable list */}
                        {!showHandRaise && !showAll && displayParticipants.length > 8 && (
                            <div
                                onClick={() => setShowAll(true)}
                                className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 flex items-center justify-between hover:bg-slate-100 cursor-pointer text-[#0f172a] transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#0f172a] text-white flex items-center justify-center text-xs font-bold shrink-0">
                                        +{displayParticipants.length - 8}
                                    </div>
                                    <span className="text-sm font-bold text-slate-800">View All Participants</span>
                                </div>
                                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                    {displayParticipants.length} total
                                </span>
                            </div>
                        )}

                        {!showHandRaise && showAll && displayParticipants.length > 8 && (
                            <div
                                onClick={() => setShowAll(false)}
                                className="border border-dashed border-slate-300 bg-slate-50/50 rounded-xl px-3 py-2 flex items-center justify-center hover:bg-slate-100 cursor-pointer text-slate-600 transition-all font-bold text-sm h-12"
                            >
                                Show Less
                            </div>
                        )}
                    </div>

                </div>
            )}

            {/* MENU PANEL (Chat/Notes/AI) */}
            {showMenuPage && (
                <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 h-full flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                        <h2 className="text-[18px] font-bold text-slate-800">Menu</h2>
                        <button onClick={() => setShowMenuPage(false)} className="w-7 h-7 rounded-lg border flex items-center justify-center hover:bg-slate-50 text-slate-500 cursor-pointer">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="mt-5 bg-slate-100 rounded-full p-1 flex items-center shadow-inner">
                        {["chat", "notes", "assistance"].map(tab => (
                            <button key={tab} onClick={() => setActiveMenu(tab)} className={`flex-1 py-2 rounded-full text-sm font-bold cursor-pointer ${activeMenu === tab ? "bg-[#0f2a78] text-white" : "text-slate-500"}`}>
                                {tab === "assistance" ? "AI" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="mt-5 flex-1 overflow-hidden flex flex-col">
                        {activeMenu === "chat" && (
                            <div className="flex flex-col h-full">
                                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                                    {chatMessages.map((msg, i) => {
                                        const isSelf = msg.user_id === userId || msg.sender === "You" || msg.sender === participantName;
                                        return (
                                            <div key={i} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                                                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl ${isSelf ? "bg-[#0f2a78] text-white rounded-tr-none" : "bg-slate-100 text-slate-700 rounded-tl-none"}`}>
                                                    <p className="text-[10px] font-bold mb-0.5 opacity-80">{isSelf ? "You" : msg.sender}</p>
                                                    <p className="text-sm">{msg.text}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={chatBottomRef} />
                                </div>
                                <div className="mt-4 flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                                        placeholder="Type a message..."
                                        className="flex-1 border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none"
                                    />
                                    <button onClick={handleSendMessage} className="w-12 h-12 rounded-2xl bg-[#0f2a78] text-white flex items-center justify-center cursor-pointer">
                                        <SendHorizontal size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                        {activeMenu === "notes" && (
                            <textarea placeholder="Write meeting notes..." className="w-full h-full border border-slate-200 rounded-2xl p-4 outline-none resize-none"></textarea>
                        )}
                        {activeMenu === "assistance" && (
                            <div className="flex flex-col gap-4">
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-slate-750">AI Transcription</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Live captions enabled</p>
                                    </div>
                                    <button onClick={() => setTranscriptionEnabled(!transcriptionEnabled)} className={`w-14 h-7 rounded-full flex items-center px-1 cursor-pointer ${transcriptionEnabled ? "bg-[#0f2a78]" : "bg-slate-300"}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${transcriptionEnabled ? "translate-x-7" : ""}`}></div>
                                    </button>
                                </div>
                                {transcriptionEnabled && (
                                    <div className="space-y-3 overflow-y-auto max-h-[300px]">
                                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                            <p className="text-sm text-slate-700"><span className="font-semibold">Rahul:</span> Let's begin.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ADD PARTICIPANTS PANEL */}
            {showAddParticipant && !showMenuPage && (
                <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 flex flex-col h-full shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2">
                            <UserPlus size={17} className="text-[#1e2b72]" />
                            Invite Participants
                        </h2>
                        <button
                            onClick={() => setShowAddParticipant(false)}
                            className="w-6 h-6 border border-slate-350 hover:border-slate-500 rounded flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        >
                            ×
                        </button>
                    </div>

                    <p className="text-[11px] text-slate-400 font-medium -mt-3 mb-4">
                        Only the host can invite participants.
                    </p>

                    {/* Invite form */}
                    <form onSubmit={handleInvite} className="flex flex-col gap-3">
                        <div>
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="email@example.com, ..."
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    disabled={inviteLoading}
                                    className="w-full border border-slate-200 focus:border-[#1e2b72] focus:ring-2 focus:ring-[#1e2b72]/10 rounded-xl py-2.5 pl-8 pr-3 text-sm outline-none transition-all"
                                />
                            </div>

                            {/* Live chip preview */}
                            {parsedEmails.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {parsedEmails.map((em) => {
                                        const isValid = emailRegex.test(em);
                                        const already = invitedList.includes(em);
                                        return (
                                            <span
                                                key={em}
                                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                                    already
                                                        ? "bg-green-50 border-green-200 text-green-700"
                                                        : isValid
                                                        ? "bg-blue-50 border-blue-200 text-[#1e2b72]"
                                                        : "bg-red-50 border-red-200 text-red-600"
                                                }`}
                                            >
                                                {already ? "✓ " : ""}{em}{!isValid && " (invalid)"}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={inviteLoading || !inviteEmail.trim()}
                            className="w-full h-10 rounded-xl bg-[#1e2b72] hover:bg-[#152060] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
                        >
                            {inviteLoading ? (
                                <><Loader2 className="size-4 animate-spin" /> Sending...</>
                            ) : (
                                "Send Invite"
                            )}
                        </button>
                    </form>

                    {/* Already invited list */}
                    {invitedList.length > 0 && (
                        <div className="mt-4 flex-1 overflow-hidden flex flex-col">
                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                                Already Invited ({invitedList.length})
                            </p>
                            <div className="overflow-y-auto flex-1 space-y-1.5 pr-0.5">
                                {invitedList.map((em) => (
                                    <div
                                        key={em}
                                        className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl group"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                            <span className="text-xs font-semibold text-slate-700 truncate">{em}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveInvited(em)}
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer"
                                            title="Remove from list"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default Sidebar;