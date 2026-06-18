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
    setShowParticipantsList, // Adding this from your new logic
    participantMembers,
    participantName,
    localVideoRef,
    isVideoOn,
    remoteStreams = [],
    roomPeers = {},
    handRaiseCount = 0,
}) => {
    // ==========================================
    // 1. LIVE PARTICIPANTS DATA
    // ==========================================
    const allParticipants = useMemo(() => {
        const list = [];
        
        // Local User
        list.push({
            id: "local-user",
            name: `${participantName} (You)`,
            isLocal: true,
            stream: null,
        });

        // Remote Users with streams
        remoteStreams.forEach((remote) => {
            list.push({
                id: remote.peerId,
                name: roomPeers[remote.peerId]?.name || "Remote User",
                isLocal: false,
                stream: remote.stream
            });
        });

        // Remote Users without streams yet
        Object.keys(roomPeers).forEach((peerId) => {
            if (!remoteStreams.some((r) => r.peerId === peerId)) {
                list.push({
                    id: peerId,
                    name: roomPeers[peerId]?.name || "Remote User",
                    isLocal: false,
                    stream: null
                });
            }
        });

        return list;
    }, [participantName, remoteStreams, roomPeers]);

    // ==========================================
    // 2. YOUR EXACT PAGINATION & ROW LOGIC
    // ==========================================
    const [currentPage, setCurrentPage] = useState(0);
    const PAGE_SIZE = 9;

    const totalPages = Math.max(1, Math.ceil(allParticipants.length / PAGE_SIZE));
    const clampedPage = Math.min(currentPage, totalPages - 1);
    const startIndex = clampedPage * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pagedParticipants = allParticipants.slice(startIndex, endIndex);

    const canGoLeft = clampedPage > 0;
    const canGoRight = clampedPage < totalPages - 1;

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages - 1));
    }, [totalPages]);

    const getParticipantInitials = (name) => {
        if (!name) return "U";
        const cleanName = name.replace(" (You)", ""); // Clean up "You" tag for initials
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

    // Primary remote stream for center stage (if not in grid view)
    const primaryRemoteStream = useMemo(() => {
        return remoteStreams.length > 0 ? remoteStreams[0] : null;
    }, [remoteStreams]);

    return (
        <div
            className={`relative rounded-[28px] overflow-hidden bg-slate-950 border border-slate-800 shadow-[0_12px_40px_rgba(0,0,0,0.4)] h-full transition-all duration-300 ${
                showParticipantsGrid
                    ? "w-full"
                    : showHandRaise || showParticipants || showMenuPage
                      ? "w-[80%]"
                      : "w-full"
            }`}
        >
            {showParticipantsGrid ? (
                // ================= YOUR LIST VIEW =================
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
                            className="bg-white text-slate-700 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-sm cursor-pointer"
                        >
                            Back to Meeting
                        </button>
                    </div>

                    <div className="space-y-3">
                        {allParticipants.map((member, index) => (
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
                // ================= YOUR EXACT GRID VIEW DESIGN =================
                <div className="relative w-full h-full p-4 bg-[#0f172a]">
                    <div className="relative w-full h-full overflow-hidden rounded-[28px]">
                        <div className="w-full h-full px-16 py-4 flex flex-col gap-4">
                            {participantRows.map((row, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className={`flex gap-4 flex-1 ${
                                        ((participantRows[0]?.length === 2 &&
                                            participantRows[1]?.length === 3) ||
                                            (participantRows[0]?.length === 3 &&
                                                participantRows[1]?.length === 4)) &&
                                        rowIndex === 0
                                            ? "justify-center"
                                            : ""
                                    }`}
                                >
                                    {row.map((member, index) => {
                                        const globalIndex =
                                            rowIndex === 0
                                                ? index
                                                : participantRows[0].length + index;

                                        // Determine if video is active for this specific tile
                                        const hasVideo = member.isLocal ? isVideoOn : !!member.stream;

                                        return (
                                            <div
                                                key={`${member.id}-${index}`}
                                                className={`relative rounded-[24px] overflow-hidden border border-white/10 bg-gradient-to-br ${getParticipantTheme(
                                                    globalIndex,
                                                )} shadow-xl ${
                                                    ((participantRows[0]?.length === 2 &&
                                                        participantRows[1]?.length === 3) ||
                                                        (participantRows[0]?.length === 3 &&
                                                            participantRows[1]?.length === 4)) &&
                                                    rowIndex === 0
                                                        ? ""
                                                        : "flex-1"
                                                }`}
                                                style={
                                                    participantRows[0]?.length === 2 &&
                                                    participantRows[1]?.length === 3 &&
                                                    rowIndex === 0
                                                        ? { flex: "0 0 30%" }
                                                        : participantRows[0]?.length === 3 &&
                                                          participantRows[1]?.length === 4 &&
                                                          rowIndex === 0
                                                        ? { flex: "0 0 23%" }
                                                        : {}
                                                }
                                            >
                                                {/* ================= LIVE VIDEO INJECTION ================= */}
                                                {hasVideo ? (
                                                    member.isLocal ? (
                                                        <video
                                                            autoPlay
                                                            muted
                                                            playsInline
                                                            ref={(el) => {
                                                                if (el && localVideoRef?.current && el.srcObject !== localVideoRef.current.srcObject) {
                                                                    el.srcObject = localVideoRef.current.srcObject;
                                                                }
                                                            }}
                                                            className="absolute inset-0 w-full h-full object-cover z-0"
                                                        />
                                                    ) : (
                                                        <video
                                                            autoPlay
                                                            playsInline
                                                            ref={(el) => {
                                                                if (el && el.srcObject !== member.stream) {
                                                                    el.srcObject = member.stream;
                                                                }
                                                            }}
                                                            className="absolute inset-0 w-full h-full object-cover z-0"
                                                        />
                                                    )
                                                ) : (
                                                    /* ================= YOUR INITIALS BUBBLE ================= */
                                                    <>
                                                        <div
                                                            className="absolute inset-0 opacity-40 z-0"
                                                            style={{
                                                                background:
                                                                    "radial-gradient(circle at center, rgba(255,255,255,0.12) 0%, transparent 70%)",
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center z-10">
                                                            <div className="w-24 h-24 rounded-full bg-black/15 flex items-center justify-center backdrop-blur-sm">
                                                                <span className="text-white text-5xl font-medium">
                                                                    {getParticipantInitials(member.name)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {/* ================= OVERLAYS ================= */}
                                                <div className="absolute top-3 right-3 bg-black/40 rounded-full p-2 z-20">
                                                    <MicOff size={16} className="text-white" />
                                                </div>

                                                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent z-20">
                                                    <p className="text-white font-semibold">
                                                        {member.name}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        {/* ================= YOUR FLOATING PAGINATION ================= */}
                        {allParticipants.length > PAGE_SIZE && (
                            <>
                                <button
                                    onClick={() =>
                                        canGoLeft &&
                                        setCurrentPage((p) => Math.max(0, p - 1))
                                    }
                                    aria-label="Previous participants"
                                    className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-lg border transition-all duration-200 ${
                                        canGoLeft
                                            ? "bg-black text-white border-black hover:scale-105"
                                            : "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"
                                    }`}
                                    disabled={!canGoLeft}
                                >
                                    <ChevronLeft size={22} />
                                </button>

                                <button
                                    onClick={() =>
                                        canGoRight &&
                                        setCurrentPage((p) =>
                                            Math.min(totalPages - 1, p + 1),
                                        )
                                    }
                                    aria-label="Next participants"
                                    className={`absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-lg border transition-all duration-200 ${
                                        canGoRight
                                            ? "bg-black text-white border-black hover:scale-105"
                                            : "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"
                                    }`}
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