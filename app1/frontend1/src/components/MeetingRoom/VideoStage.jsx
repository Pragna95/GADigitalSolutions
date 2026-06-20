import React, { useMemo, useState, useEffect } from "react";
import { MicOff, VideoOff, User, ChevronLeft, ChevronRight } from "lucide-react";

const VideoStage = ({
    showParticipantsGrid,
    setShowParticipantsGrid,
    showHandRaise,
    showParticipants,
    showMenuPage,
    setShowParticipants,
    setShowHandRaise,
    setShowMenuPage,
    setShowParticipantsList,
    participantMembers,
    participantName,
    localVideoRef,
    isVideoOn,
    isMicOn,
    remoteMicStates = {},
    remoteStreams = [],
    roomPeers = {},
    handRaiseCount = 0,
    liveParticipants = [],
    userId,
}) => {
    // ==========================================
    // 1. LIVE SYNCHRONIZED PARTICIPANTS
    // ==========================================
    const activeParticipants = useMemo(() => {
        const list = [];

        // Always add You first
        list.push({
            id: "local-user",
            name: `${participantName} (You)`,
            isLocal: true,
            stream: null,
            micOn: isMicOn,
        });

        // Add Remote Users from the server-authoritative liveParticipants list
        const remoteParticipants = liveParticipants.filter(p => p.user_id !== userId);

        remoteParticipants.forEach((p) => {
            const rStream = remoteStreams.find(r => roomPeers[r.peerId]?.user_id === p.user_id);
            const cleanName = p.name ? p.name.replace(/_[a-zA-Z0-9]{5}$/, "") : "Remote User";
            list.push({
                id: p.id || `remote-${p.user_id}`,
                name: cleanName,
                isLocal: false,
                stream: rStream ? rStream.stream : null,
                // ✅ Default to "on" until we've actually heard otherwise for this user_id
                micOn: remoteMicStates[p.user_id] !== undefined ? remoteMicStates[p.user_id] : true,
            });
        });

        console.log("ACTIVE PARTICIPANTS", list);
        return list;
    }, [participantName, userId, liveParticipants, remoteStreams, roomPeers, isMicOn, remoteMicStates]);

    // ==========================================
    // 2. PAGINATION & ROW LOGIC
    // ==========================================
    const [currentPage, setCurrentPage] = useState(0);
    const PAGE_SIZE = 9;

    const totalPages = Math.max(1, Math.ceil(activeParticipants.length / PAGE_SIZE));
    const clampedPage = Math.min(currentPage, totalPages - 1);
    const startIndex = clampedPage * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pagedParticipants = activeParticipants.slice(startIndex, endIndex);

    const canGoLeft = clampedPage > 0;
    const canGoRight = clampedPage < totalPages - 1;

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages - 1));
    }, [totalPages]);

    const getParticipantInitials = (name) => {
        if (!name) return "U";
        const cleanName = name.replace(" (You)", "");
        const parts = cleanName.trim().split(/\s+/);
        if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
        return cleanName.substring(0, Math.min(2, cleanName.length)).toUpperCase();
    };

    const getParticipantTheme = (index) => {
        const themes = [
            "from-green-900 via-green-800 to-green-700",
            "from-pink-900 via-pink-800 to-pink-700",
            "from-blue-900 via-blue-800 to-blue-700",
            "from-purple-900 via-purple-800 to-purple-700",
            "from-orange-900 via-orange-800 to-orange-700",
            "from-teal-900 via-teal-800 to-teal-700",
        ];
        return themes[index % themes.length];
    };

    const getRowSizes = (count) => {
        if (count <= 0) return [];
        if (count <= 4) return [count];
        if (count === 5) return [2, 3];
        if (count === 6) return [3, 3];
        if (count === 7) return [3, 4];
        if (count === 8) return [4, 4];
        return [4, 5];
    };

    const getParticipantRows = (items) => {
        const sizes = getRowSizes(items.length);
        const rows = [];
        let start = 0;
        sizes.forEach((size) => {
            rows.push(items.slice(start, start + size));
            start += size;
        });
        return rows;
    };

    const participantRows = getParticipantRows(pagedParticipants);
    const primaryRemoteStream = useMemo(() => {
        return remoteStreams.length > 0 ? remoteStreams[0] : null;
    }, [remoteStreams]);

    return (
        <div
            className={`relative rounded-[28px] overflow-hidden bg-slate-950 border border-slate-800 shadow-[0_12px_40px_rgba(0,0,0,0.4)] h-full transition-all duration-300 ${showParticipantsGrid
                    ? "w-full"
                    : showHandRaise || showParticipants || showMenuPage
                        ? "w-[80%]"
                        : "w-full"
                }`}
        >
            {/* 🔥 FIX 2: Hidden anchor keeps your local camera hardware permanently active! */}
            <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
            {showParticipantsGrid ? (
                // ================= LIST VIEW =================
                <div className="w-full h-full bg-[#0f172a] p-6 overflow-y-auto">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-white text-2xl font-bold tracking-tight">
                            All Participants
                        </h2>
                        <button
                            onClick={() => {
                                setShowParticipantsGrid(false);
                                setShowParticipants(false);
                                setShowHandRaise(false);
                                setShowMenuPage(false);
                                if (setShowParticipantsList) setShowParticipantsList(false);
                            }}
                            className="bg-white text-slate-700 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all duration-200 shadow-sm"
                        >
                            Back to Meeting
                        </button>
                    </div>
                    <div className="space-y-3">
                        {activeParticipants.map((member, index) => (
                            <div
                                key={`${member.id}-${index}`}
                                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-white"
                            >
                                <span className="font-semibold text-[15px]">{member.name}</span>
                                <span className="text-white/40 text-sm">
                                    {member.isLocal ? "You" : "Participant"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                // ================= MAIN GRID / STAGE =================
                <div className="relative w-full h-full p-4 bg-[#0f172a]">

                    {/* ================= RESTORED TOP RIGHT OVERLAYS ================= */}
                    <div className="absolute top-5 right-5 flex flex-col items-end gap-4 z-40">
                        {/* PARTICIPANTS OVERLAY BUTTON */}
                        <button
                            onClick={() => {
                                setShowParticipants(!showParticipants);
                                setShowHandRaise(false);
                                setShowMenuPage(false);
                            }}
                            className="relative w-[96px] h-[40px] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group"
                        >
                            <img
                                src="https://randomuser.me/api/portraits/women/65.jpg"
                                alt=""
                                className="absolute left-0 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md group-hover:-translate-x-1 transition-transform duration-300"
                            />
                            <img
                                src="https://randomuser.me/api/portraits/men/60.jpg"
                                alt=""
                                className="absolute left-7 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md transition-transform duration-300"
                            />
                            <div className="absolute left-[56px] top-0 w-10 h-10 rounded-[12px] border-2 border-white bg-[#ACBFFF] flex items-center justify-center shadow-md group-hover:translate-x-1 transition-transform duration-300">
                                <span className="text-[12px] font-semibold text-[#394C84]">
                                    +{Math.max(0, activeParticipants.length - 2)}
                                </span>
                            </div>
                        </button>

                        {/* HAND RAISE & EXTRA OVERLAY */}
                        <div className="flex items-center gap-2 animate-fade-in">
                            <button
                                onClick={() => {
                                    setShowHandRaise(!showHandRaise);
                                    setShowParticipants(false);
                                    setShowMenuPage(false);
                                }}
                                className="bg-white hover:bg-yellow-50 h-[38px] px-4 rounded-[22px] flex items-center justify-center shadow-lg border border-yellow-200 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer gap-2"
                            >
                                <span className="text-[18px] leading-none">✋</span>
                                <span id="hand-count" className="text-[15px] font-bold leading-none text-slate-800"
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: "20px",
                                        background: "#fbbf24",
                                        color: "#1e293b",
                                        borderRadius: "999px",
                                        padding: "2px 8px",
                                        fontWeight: 800,
                                        fontSize: "13px",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                                    }}
                                >
                                    {handRaiseCount}
                                </span>
                            </button>

                            <div className="w-10 h-10 rounded-[12px] border-2 border-white bg-[#ACBFFF] flex items-center justify-center shadow-md">
                                <span className="text-[16px] text-[#394C84]">👤</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative w-full h-full overflow-hidden rounded-[28px]">
                        <div className="w-full h-full px-16 py-4 flex flex-col gap-4">
                            {participantRows.map((row, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className={`flex gap-4 flex-1 ${((participantRows[0]?.length === 2 && participantRows[1]?.length === 3) ||
                                            (participantRows[0]?.length === 3 && participantRows[1]?.length === 4)) && rowIndex === 0
                                            ? "justify-center" : ""
                                        }`}
                                >
                                    {row.map((member, index) => {
                                        const globalIndex = rowIndex === 0 ? index : participantRows[0].length + index;
                                        const hasVideo = member.isLocal ? isVideoOn : !!member.stream;

                                        return (
                                            <div
                                                key={`${member.id}-${index}`}
                                                className={`relative rounded-[24px] overflow-hidden border border-white/10 bg-gradient-to-br ${getParticipantTheme(globalIndex)} shadow-xl ${((participantRows[0]?.length === 2 && participantRows[1]?.length === 3) ||
                                                        (participantRows[0]?.length === 3 && participantRows[1]?.length === 4)) && rowIndex === 0
                                                        ? "" : "flex-1"
                                                    }`}
                                                style={
                                                    participantRows[0]?.length === 2 && participantRows[1]?.length === 3 && rowIndex === 0 ? { flex: "0 0 30%" }
                                                        : participantRows[0]?.length === 3 && participantRows[1]?.length === 4 && rowIndex === 0 ? { flex: "0 0 23%" }
                                                            : {}
                                                }
                                            >
                                                {/* INJECT LIVE VIDEO OR GRADIENT INITIALS */}
                                                {hasVideo ? (
                                                    <video
                                                        autoPlay
                                                        muted={member.isLocal}
                                                        playsInline
                                                        ref={(el) => {
                                                            const srcObj = member.isLocal ? localVideoRef?.current?.srcObject : member.stream;
                                                            if (el && srcObj && el.srcObject !== srcObj) {
                                                                el.srcObject = srcObj;
                                                                // ✅ Explicit play() — autoPlay attribute alone can be
                                                                // silently blocked by the browser, which is the most
                                                                // common reason remote audio never starts.
                                                                el.play().catch(() => {});
                                                            }
                                                        }}
                                                        className="absolute inset-0 w-full h-full object-cover z-0"
                                                    />
                                                ) : (
                                                    <>
                                                        <div className="absolute inset-0 opacity-40 z-0" style={{ background: "radial-gradient(circle at center, rgba(255,255,255,0.12) 0%, transparent 70%)" }} />
                                                        <div className="absolute inset-0 flex items-center justify-center z-10">
                                                            <div className="w-24 h-24 rounded-full bg-black/15 flex items-center justify-center backdrop-blur-sm">
                                                                <span className="text-white text-5xl font-medium">{getParticipantInitials(member.name)}</span>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {!member.micOn && (
                                                    <div className="absolute top-3 right-3 bg-black/40 rounded-full p-2 z-20">
                                                        <MicOff size={16} className="text-white" />
                                                    </div>
                                                )}

                                                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent z-20">
                                                    <p className="text-white font-semibold">{member.name}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        {/* ================= PAGINATION CONTROLS ================= */}
                        {activeParticipants.length > PAGE_SIZE && (
                            <>
                                <button
                                    onClick={() => canGoLeft && setCurrentPage((p) => Math.max(0, p - 1))}
                                    className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-lg border transition-all duration-200 ${canGoLeft ? "bg-black text-white border-black hover:scale-105" : "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"}`}
                                    disabled={!canGoLeft}
                                >
                                    <ChevronLeft size={22} />
                                </button>
                                <button
                                    onClick={() => canGoRight && setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                                    className={`absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-lg border transition-all duration-200 ${canGoRight ? "bg-black text-white border-black hover:scale-105" : "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"}`}
                                    disabled={!canGoRight}
                                >
                                    <ChevronRight size={22} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoStage;