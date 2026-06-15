import React, { useState } from "react";
import { Search, X, SendHorizontal } from "lucide-react";

const Sidebar = ({
    showHandRaise,
    setShowHandRaise,
    showParticipants,
    setShowParticipants,
    showParticipantsGrid,
    showMenuPage,
    setShowMenuPage,
    handRaiseMembers,
    participantMembers,
    setShowParticipantsGridDirect, // Optional override callback
}) => {
    // Keep local states for chat, notes, AI tabs to clean up index.jsx
    const [activeMenu, setActiveMenu] = useState("assistance");
    const [message, setMessage] = useState("");
    const [chatMessages, setChatMessages] = useState([
        {
            sender: "Rahul",
            text: "Can we start the demo?",
        },
        {
            sender: "Anika",
            text: "Sharing the screen now.",
        },
    ]);
    const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);

    const handleSendMessage = () => {
        if (message.trim() === "") return;

        setChatMessages([
            ...chatMessages,
            {
                sender: "You",
                text: message,
            },
        ]);

        setMessage("");
    };

    return (
        <>
            {/* ================= SIDEBAR ================= */}
            {(showHandRaise || showParticipants) &&
                !showParticipantsGrid &&
                !showMenuPage && (
                    <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 flex flex-col h-full shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                        {/* TOP */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[17px] font-bold text-slate-800">
                                {showHandRaise ? "Hand Raise" : "Participants"}
                            </h2>

                            <button
                                onClick={() => {
                                    setShowHandRaise(false);
                                    setShowParticipants(false);
                                }}
                                className="w-6 h-6 border border-slate-350 hover:border-slate-500 rounded flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            >
                                ×
                            </button>
                        </div>

                        {/* SEARCH */}
                        <div className="relative mb-4">
                            <Search
                                size={15}
                                className="absolute left-3 top-3 text-slate-400"
                            />

                            <input
                                type="text"
                                placeholder="search"
                                className="w-full border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-xl py-2 pl-9 pr-3 text-sm outline-none transition-all duration-200"
                            />
                        </div>

                        {/* COUNT */}
                        <p className="text-sm font-semibold text-slate-500 mb-4">
                            {showHandRaise ? "12 Members" : "40 Participants"}
                        </p>

                        {/* MEMBERS */}
                        <div className="space-y-3 overflow-y-auto flex-1 dark-scroll">
                            {(showHandRaise
                                ? handRaiseMembers
                                : participantMembers.slice(0, 8)
                            ).map((member, index) => (
                                <div
                                    key={index}
                                    className="border border-slate-100 rounded-xl px-3 py-2 flex items-center justify-between hover:bg-slate-50/80 hover:border-slate-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={`https://randomuser.me/api/portraits/${
                                                index % 2 === 0 ? "men" : "women"
                                            }/${index + 20}.jpg`}
                                            className="w-10 h-10 rounded-full object-cover shadow-sm"
                                            alt=""
                                        />

                                        <span className="text-sm font-semibold text-slate-700">
                                            {member}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* VIEW ALL PARTICIPANTS */}
                        {!showHandRaise && (
                            <button
                                onClick={() => {
                                    if (setShowParticipantsGridDirect) {
                                        setShowParticipantsGridDirect(true);
                                    }
                                }}
                                className="mt-5 bg-[#0f172a] hover:bg-[#1e293b] active:scale-[0.98] text-white py-3 rounded-2xl text-sm font-bold shadow-sm transition-all duration-200 cursor-pointer"
                            >
                                View All Participants
                            </button>
                        )}
                    </div>
                )}

            {/* ================= MENU PAGE ================= */}
            {showMenuPage && (
                <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 h-full flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                    {/* HEADER */}
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                        <h2 className="text-[18px] font-bold text-slate-800">
                            Menu
                        </h2>

                        <button
                            onClick={() => setShowMenuPage(false)}
                            className="w-7 h-7 rounded-lg border border-slate-350 hover:border-slate-500 flex items-center justify-center hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* TABS */}
                    <div className="mt-5 bg-slate-100 rounded-full p-1 flex items-center shadow-inner">
                        <button
                            onClick={() => setActiveMenu("chat")}
                            className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
                                activeMenu === "chat"
                                    ? "bg-[#0f2a78] text-white shadow-md"
                                    : "text-slate-500 hover:text-slate-850"
                            }`}
                        >
                            Chat
                        </button>

                        <button
                            onClick={() => setActiveMenu("notes")}
                            className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
                                activeMenu === "notes"
                                    ? "bg-[#0f2a78] text-white shadow-md"
                                    : "text-slate-500 hover:text-slate-850"
                            }`}
                        >
                            Notes
                        </button>

                        <button
                            onClick={() => setActiveMenu("assistance")}
                            className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
                                activeMenu === "assistance"
                                    ? "bg-[#0f2a78] text-white shadow-md"
                                    : "text-slate-500 hover:text-slate-850"
                            }`}
                        >
                            AI
                        </button>
                    </div>

                    {/* CONTENT */}
                    <div className="mt-5 flex-1 overflow-hidden flex flex-col">
                        {/* CHAT */}
                        {activeMenu === "chat" && (
                            <div className="flex flex-col h-full animate-fade-in">
                                <div className="flex-1 overflow-y-auto space-y-4 pr-1 dark-scroll">
                                    {chatMessages.map((msg, index) => (
                                        <div
                                            key={index}
                                            className={`flex ${
                                                msg.sender === "You"
                                                    ? "justify-end"
                                                    : "justify-start"
                                            }`}
                                        >
                                            <div
                                                className={`max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm ${
                                                    msg.sender === "You"
                                                        ? "bg-[#0f2a78] text-white rounded-tr-none"
                                                        : "bg-slate-100 text-slate-700 rounded-tl-none"
                                                }`}
                                            >
                                                <p className="text-[10px] font-bold mb-0.5 opacity-80">
                                                    {msg.sender}
                                                </p>
                                                <p className="text-sm leading-relaxed">
                                                    {msg.text}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* INPUT */}
                                <div className="mt-4 flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={message}
                                        onChange={(e) =>
                                            setMessage(e.target.value)
                                        }
                                        placeholder="Type a message..."
                                        className="flex-1 border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-2xl px-4 py-3 text-sm outline-none transition-all duration-200"
                                    />

                                    <button
                                        onClick={handleSendMessage}
                                        className="w-12 h-12 rounded-2xl bg-[#0f2a78] hover:bg-[#153eac] hover:scale-105 active:scale-95 text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-md"
                                    >
                                        <SendHorizontal size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* NOTES */}
                        {activeMenu === "notes" && (
                            <textarea
                                placeholder="Write meeting notes..."
                                className="w-full h-full border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-2xl p-4 outline-none resize-none transition-all duration-205 animate-fade-in"
                            ></textarea>
                        )}

                        {/* AI */}
                        {activeMenu === "assistance" && (
                            <div className="flex flex-col gap-4 animate-fade-in">
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                                    <div>
                                        <p className="font-bold text-slate-750">
                                            AI Transcription
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            Live captions enabled
                                        </p>
                                    </div>

                                    <button
                                        onClick={() =>
                                            setTranscriptionEnabled(
                                                !transcriptionEnabled,
                                            )
                                        }
                                        className={`w-14 h-7 rounded-full flex items-center px-1 transition-colors duration-300 cursor-pointer ${
                                            transcriptionEnabled
                                                ? "bg-[#0f2a78]"
                                                : "bg-slate-300"
                                        }`}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                                                transcriptionEnabled
                                                    ? "translate-x-7"
                                                    : ""
                                            }`}
                                        ></div>
                                    </button>
                                </div>

                                {/* LIVE TRANSCRIPTION */}
                                {transcriptionEnabled && (
                                    <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1 dark-scroll">
                                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                            <p className="text-[10px] font-bold text-blue-700 mb-1 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                                                LIVE
                                            </p>
                                            <p className="text-sm text-slate-700 leading-relaxed">
                                                <span className="font-semibold">
                                                    Rahul:
                                                </span>{" "}
                                                Let's begin the sprint review
                                                meeting.
                                            </p>
                                        </div>

                                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                            <p className="text-[10px] font-bold text-blue-700 mb-1 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                                                LIVE
                                            </p>
                                            <p className="text-sm text-slate-700 leading-relaxed">
                                                <span className="font-semibold">
                                                    Anika:
                                                </span>{" "}
                                                Sharing the analytics dashboard
                                                now.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default Sidebar;
