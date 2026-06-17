import React, { useState } from "react";
import { Search, X, SendHorizontal } from "lucide-react";

const Sidebar = ({
    showHandRaise, setShowHandRaise,
    showParticipants, setShowParticipants,
    showMenuPage, setShowMenuPage,
    setShowParticipantsGrid,
    handRaiseMembers, participantMembers
}) => {
    const [activeMenu, setActiveMenu] = useState("chat");
    const [message, setMessage] = useState("");
    const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
    const [chatMessages, setChatMessages] = useState([
        { sender: "Rahul", text: "Can we start the demo?" },
        { sender: "Anika", text: "Sharing the screen now." },
    ]);

    const handleSendMessage = () => {
        if (message.trim() === "") return;
        setChatMessages([...chatMessages, { sender: "You", text: message }]);
        setMessage("");
    };

    if (!showHandRaise && !showParticipants && !showMenuPage) return null;

    return (
        <>
            {/* PARTICIPANTS & HAND RAISE PANEL */}
            {(showHandRaise || showParticipants) && !showMenuPage && (
                <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 flex flex-col h-full shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[17px] font-bold text-slate-800">
                            {showHandRaise ? "Hand Raise" : "Participants"}
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
                        {(showHandRaise ? handRaiseMembers : participantMembers.slice(0, 8)).map((member, index) => (
                            <div key={index} className="border border-slate-100 rounded-xl px-3 py-2 flex items-center gap-3 hover:bg-slate-50 cursor-pointer">
                                {showHandRaise ? (
                                    <div className="w-10 h-10 rounded-[12px] bg-[#ACBFFF] flex items-center justify-center shadow-md shrink-0">
                                        <span className="text-[16px] text-[#394C84]">👤</span>
                                    </div>
                                ) : (
                                    <img src={`https://randomuser.me/api/portraits/${index % 2 === 0 ? "men" : "women"}/${index + 20}.jpg`} className="w-10 h-10 rounded-full object-cover" alt="" />
                                )}
                                <span className="text-sm font-semibold text-slate-700">{member}</span>
                            </div>
                        ))}
                    </div>

                    {!showHandRaise && (
                        <button onClick={() => setShowParticipantsGrid(true)} className="mt-5 bg-[#0f172a] text-white py-3 rounded-2xl text-sm font-bold shadow-sm cursor-pointer">
                            View All Participants
                        </button>
                    )}
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
                                    {chatMessages.map((msg, i) => (
                                        <div key={i} className={`flex ${msg.sender === "You" ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl ${msg.sender === "You" ? "bg-[#0f2a78] text-white rounded-tr-none" : "bg-slate-100 text-slate-700 rounded-tl-none"}`}>
                                                <p className="text-[10px] font-bold mb-0.5 opacity-80">{msg.sender}</p>
                                                <p className="text-sm">{msg.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 flex items-center gap-2">
                                    <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a message..." className="flex-1 border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none" />
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
        </>
    );
};

export default Sidebar;