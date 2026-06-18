import React, { useMemo } from "react";
import { MicOff, VideoOff, User } from "lucide-react";

const VideoStage = ({
    showParticipantsGrid,
    setShowParticipantsGrid,
    showHandRaise,
    showParticipants,
    showMenuPage,
    setShowParticipants,
    setShowHandRaise,
    setShowMenuPage,
    participantMembers,
    participantName,
    localVideoRef,
    isVideoOn,
    remoteStreams = [],
    roomPeers = {},
    handRaiseCount = 0,
}) => {
    // Determine the primary stream to focus on the center stage
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
            {/* ================= PARTICIPANTS GRID ================= */}
            {showParticipantsGrid ? (
                <div className="w-full h-full bg-[#0f172a] p-6 overflow-y-auto animate-fade-in">
                    {/* TOP BAR */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-white text-2xl font-bold tracking-tight">
                            All Participants ({participantMembers.length})
                        </h2>

                        <button
                            onClick={() => setShowParticipantsGrid(false)}
                            className="bg-white text-slate-700 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-sm cursor-pointer"
                        >
                            Back to Meeting
                        </button>
                    </div>

                    {/* GRID */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                        {participantMembers.map((member, index) => (
                            <div
                                key={index}
                                className="relative h-[240px] rounded-[24px] overflow-hidden border border-slate-800 bg-slate-900 hover:border-blue-500 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-all duration-300 cursor-pointer group"
                            >
                                <img
                                    src={`https://randomuser.me/api/portraits/${
                                        index % 2 === 0 ? "men" : "women"
                                    }/${index + 20}.jpg`}
                                    alt={member}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />

                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/5 transition-colors duration-300"></div>

                                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                                    <div className="bg-black/50 backdrop-blur-xl px-3 py-1 rounded-xl text-white text-sm font-semibold border border-white/5 shadow-md">
                                        {member}
                                    </div>

                                    <div className="bg-black/50 backdrop-blur-xl p-2 rounded-full border border-white/5 shadow-md">
                                        <MicOff size={15} className="text-white/80" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* ================= MAIN CENTER STAGE AREA ================= */}
                    <div className="absolute inset-0 w-full h-full bg-slate-900 flex items-center justify-center">
                        {primaryRemoteStream ? (
                            /* Render Active Remote Speaker on Center Stage */
                            <div className="w-full h-full relative">
                                <video
                                    autoPlay
                                    playsInline
                                    ref={(el) => {
                                        if (el && el.srcObject !== primaryRemoteStream.stream) {
                                            el.srcObject = primaryRemoteStream.stream;
                                        }
                                    }}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute bottom-7 left-7 bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 z-20">
                                    <p className="text-white text-xl font-bold tracking-tight">
                                        {roomPeers[primaryRemoteStream.peerId]?.name || "Remote User"}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            /* Fallback: Render Local Video Stream in Center Stage if Solo */
                            <div className="w-full h-full relative flex items-center justify-center bg-slate-900">
                                {isVideoOn ? (
                                    <video
                                        ref={(el) => {
                                            if (el && localVideoRef?.current && el.srcObject !== localVideoRef.current.srcObject) {
                                                el.srcObject = localVideoRef.current.srcObject;
                                            }
                                        }}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-4 text-slate-500 animate-fade-in">
                                        <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shadow-inner">
                                            <User size={44} className="text-slate-400" />
                                        </div>
                                        <p className="text-sm font-medium tracking-wide text-slate-400">
                                            Camera is turned off
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="absolute inset-0 bg-black/5 pointer-events-none"></div>

                    {/* ================= TOP RIGHT OVERLAYS ================= */}
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
                                    +{participantMembers.length > 2 ? participantMembers.length - 2 : 0}
                                </span>
                            </div>
                        </button>

                        {/* HAND RAISE OVERLAY */}
                        {true && (
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
                        )}
                    </div>

                    {/* ONLY SHOW SUB-LABEL IF NOT SHOWING REMOTE USER IN CENTER */}
                    {!primaryRemoteStream && (
                        <h1 className="absolute bottom-7 left-7 text-white text-[38px] font-extrabold tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-20 pointer-events-none">
                            {participantName} (You)
                        </h1>
                    )}

                    {/* ================= FLOATING CORNER PICTURE-IN-PICTURE TILES ================= */}
                    <div className="absolute bottom-5 right-5 z-20 space-y-3 max-h-[80%] overflow-y-auto p-1 pointer-events-auto">
                        {/* Always show small self-view if a remote user is taking up the center stage */}
                        {primaryRemoteStream && (
                            <div className="relative w-[220px] h-[140px] rounded-[24px] overflow-hidden bg-black/90 border border-white/10 shadow-2xl transition-all">
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute left-3 bottom-3 bg-black/60 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-white">
                                    You
                                </div>
                                {!isVideoOn && (
                                    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400">
                                        <VideoOff size={20} />
                                        <span className="text-[10px] mt-1">Camera off</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Render all other peer streams on the right side stack */}
                        {remoteStreams.length > 0 && (
                            <div className="flex flex-col gap-2 w-[220px]">
                                {remoteStreams.map((remote, idx) => {
                                    // Skip the first one if it's already highlighted in the center view
                                    if (idx === 0) return null;

                                    return (
                                        <div
                                            key={remote.peerId}
                                            className="relative w-full h-[120px] rounded-[20px] overflow-hidden bg-black/90 border border-white/10 shadow-lg"
                                        >
                                            <video
                                                autoPlay
                                                playsInline
                                                ref={(el) => {
                                                    if (el && el.srcObject !== remote.stream) {
                                                        el.srcObject = remote.stream;
                                                    }
                                                }}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute left-3 bottom-3 bg-black/70 px-2 py-1 rounded-lg text-[10px] font-medium text-white border border-white/5">
                                                {roomPeers[remote.peerId]?.name || "Remote User"}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default VideoStage;