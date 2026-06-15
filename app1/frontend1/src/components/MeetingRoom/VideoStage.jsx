import React from "react";
import { MicOff } from "lucide-react";

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
    remoteStreams,
    roomPeers,
}) => {
    return (
        <div
            className={`relative rounded-[28px] overflow-hidden bg-slate-900 border border-slate-850 shadow-[0_12px_40px_rgba(0,0,0,0.25)] h-full transition-all duration-300 ${
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
                            All Participants
                        </h2>

                        <button
                            onClick={() => setShowParticipantsGrid(false)}
                            className="bg-white text-slate-700 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-sm cursor-pointer"
                        >
                            Back to Meeting
                        </button>
                    </div>

                    {/* GRID */}
                    <div className="grid grid-cols-4 gap-5">
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
                                        <MicOff
                                            size={15}
                                            className="text-white/80"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* IMAGE */}
                    <img
                        src="https://images.unsplash.com/photo-1546961329-78bef0414d7c?q=80&w=1600"
                        alt="meeting"
                        className="absolute inset-0 w-full h-full object-cover object-center"
                    />

                    <div className="absolute inset-0 bg-black/5"></div>

                    {/* ================= TOP RIGHT OVERLAYS ================= */}
                    <div className="absolute top-5 right-5 flex flex-col items-end gap-4 z-40">
                        {/* PARTICIPANTS OVERLAY */}
                        <button
                            onClick={() => {
                                setShowParticipants(!showParticipants);
                                setShowHandRaise(false);
                                setShowMenuPage(false);
                            }}
                            className="relative w-[96px] h-[40px] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group"
                        >
                            {/* Avatar 1 */}
                            <img
                                src="https://randomuser.me/api/portraits/women/65.jpg"
                                alt=""
                                className="absolute left-0 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md group-hover:-translate-x-1 transition-transform duration-300"
                            />

                            {/* Avatar 2 */}
                            <img
                                src="https://randomuser.me/api/portraits/men/60.jpg"
                                alt=""
                                className="absolute left-7 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md transition-transform duration-300"
                            />

                            {/* +3 */}
                            <div className="absolute left-[56px] top-0 w-10 h-10 rounded-[12px] border-2 border-white bg-[#ACBFFF] flex items-center justify-center shadow-md group-hover:translate-x-1 transition-transform duration-300">
                                <span className="text-[12px] font-semibold text-[#394C84]">
                                    +3
                                </span>
                            </div>
                        </button>

                        {/* HAND RAISE OVERLAY */}
                        <div className="flex items-end gap-3">
                            {/* HAND RAISE COUNT */}
                            <button
                                onClick={() => {
                                    setShowHandRaise(!showHandRaise);
                                    setShowParticipants(false);
                                    setShowMenuPage(false);
                                }}
                                className="bg-white hover:bg-gray-50 h-[38px] px-4 rounded-[22px] flex items-center justify-center shadow-lg border border-gray-100 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
                            >
                                <span className="text-[18px] font-bold leading-none text-black">
                                    ✋ 12
                                </span>
                            </button>

                            {/* AVATAR STACK */}
                            <div className="relative w-[96px] h-[40px] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group">
                                {/* Avatar 1 */}
                                <img
                                    src="https://randomuser.me/api/portraits/women/33.jpg"
                                    alt=""
                                    className="absolute left-0 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md group-hover:-translate-x-1 transition-transform duration-300"
                                />

                                {/* Avatar 2 */}
                                <img
                                    src="https://randomuser.me/api/portraits/men/33.jpg"
                                    alt=""
                                    className="absolute left-7 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md transition-transform duration-300"
                                />

                                {/* +3 */}
                                <div className="absolute left-[56px] top-0 w-10 h-10 rounded-[12px] border-2 border-white bg-[#ACBFFF] flex items-center justify-center shadow-md group-hover:translate-x-1 transition-transform duration-300">
                                    <span className="text-[12px] font-semibold text-[#394C84]">
                                        +3
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* NAME */}
                    <h1 className="absolute bottom-7 left-7 text-white text-[38px] font-extrabold tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-20">
                        {participantName}
                    </h1>

                    {/* SMALL VIDEO */}
                    <div className="absolute bottom-5 right-5 z-20 space-y-3">
                        <div className="relative w-[220px] h-[140px] rounded-[24px] overflow-hidden bg-black/90 border border-white/10 shadow-2xl">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            {!isVideoOn && (
                                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white">
                                    <MicOff size={24} />
                                    <span className="text-xs mt-2">Camera off</span>
                                </div>
                            )}
                        </div>

                        {remoteStreams.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                                {remoteStreams.slice(0, 2).map((remote) => (
                                    <div
                                        key={remote.peerId}
                                        className="relative w-full h-[80px] rounded-[20px] overflow-hidden bg-black/90 border border-white/10"
                                    >
                                        <video
                                            autoPlay
                                            playsInline
                                            ref={(el) => {
                                                if (el) {
                                                    el.srcObject = remote.stream;
                                                }
                                            }}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute left-2 bottom-2 bg-black/70 px-2 py-1 rounded-full text-[10px] text-white">
                                            {roomPeers[remote.peerId]?.name || remote.peerId}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default VideoStage;
