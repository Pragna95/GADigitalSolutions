import React, { useMemo } from "react";
import { Monitor, X, MicOff } from "lucide-react";

// --- Sub-components for encapsulation ---

export const InitialsAvatar = ({ name, isSelf = false }) => (
    <div
        className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-base shrink-0 border-2 ${
            isSelf ? "bg-indigo-700 border-indigo-400" : "bg-slate-600 border-slate-400"
        }`}
    >
        {(name || "??").slice(0, 2).toUpperCase()}
    </div>
);

export const ParticipantTile = ({ name, isSelf = false, isMuted = false }) => (
    <div className="relative w-[150px] h-[100px] rounded-2xl overflow-hidden bg-[#1e1f26] border border-white/10 shadow-xl flex items-center justify-center shrink-0">
        <div className="flex flex-col items-center gap-2">
            <InitialsAvatar name={name} isSelf={isSelf} />
            <p className="text-white text-xs font-semibold truncate max-w-[130px] px-2 text-center">
                {isSelf ? `${name} (You)` : name}
            </p>
        </div>
        {isMuted && (
            <div className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1">
                <MicOff size={11} className="text-red-400" />
            </div>
        )}
    </div>
);

// --- Main Screen Share UI Module ---

export const ScreenShareModule = ({
    userId,
    displayName,
    isMicOn,
    isLocalScreenSharing,
    isAnotherUserSharing,
    screenSharer,
    screenStream,
    stopSharing,
    liveParticipants = [],
}) => {
    const isScreenSharing = isLocalScreenSharing || isAnotherUserSharing;

    const getSharerLabel = () => {
        if (!screenSharer) return "";
        return screenSharer.name || "Someone";
    };

    const screenShareTiles = useMemo(() => {
        const list = [];
        // Add self first
        list.push({ userId, name: displayName, isSelf: true });
        // Add remote participants
        liveParticipants.forEach((p) => {
            if (p.user_id !== userId) {
                const cleanName = p.name ? p.name.replace(/_[a-zA-Z0-9]{5}$/, "") : "Remote User";
                list.push({ userId: p.user_id, name: cleanName, isSelf: false });
            }
        });
        return list;
    }, [liveParticipants, userId, displayName]);

    if (!isScreenSharing) return null;

    return (
        <div className="absolute inset-0 bg-[#0e0e10] flex flex-col">
            <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-5 pt-4 pointer-events-none">
                <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg">
                    <Monitor size={15} className="text-green-400" />
                    <span>
                        {isLocalScreenSharing ? `${displayName} (You, presenting)` : `${getSharerLabel()} is presenting`}
                    </span>
                </div>
                {isLocalScreenSharing && (
                    <button
                        onClick={stopSharing}
                        className="pointer-events-auto flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg transition"
                    >
                        <X size={14} /> Stop presenting
                    </button>
                )}
            </div>

            <div className="absolute inset-0 flex items-center justify-center pt-14 pb-[118px] px-4">
                <video
                    autoPlay
                    playsInline
                    muted={isLocalScreenSharing}
                    ref={(el) => {
                        if (el) {
                            if (el.srcObject !== screenStream) {
                                el.srcObject = screenStream;
                                if (screenStream) {
                                    el.play().catch((err) => console.warn("Failed to play screen share stream:", err));
                                }
                            }
                        }
                    }}
                    className="w-full h-full object-contain rounded-xl bg-black"
                />
            </div>

            <div
                className="absolute bottom-0 left-0 right-0 h-[110px] flex items-center px-5 gap-3 overflow-x-auto z-40"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 70%, transparent)" }}
            >
                {screenShareTiles.map((tile) => (
                    <ParticipantTile key={tile.userId} name={tile.name} isSelf={tile.isSelf} isMuted={tile.isSelf ? !isMicOn : false} />
                ))}
            </div>
        </div>
    );
};

export default ScreenShareModule;