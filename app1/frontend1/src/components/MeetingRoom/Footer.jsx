import React from "react";
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    Share,
    UserPlus,
    MoreVertical,
    Copy,
    LayoutGrid,
    FilePenLine,
    ChevronDown,
    PhoneOff,
    UserMinus,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { toast } from "react-hot-toast";

const Footer = ({
    meetingId,
    isMicOn,
    toggleMic,
    isVideoOn,
    toggleVideo,
    isHandRaised,
    toggleHandRaise,
    showMenuPage,
    setShowMenuPage,
    setShowParticipants,
    setShowHandRaise,
    isLocalScreenSharing = false,
    isAnotherUserSharing = false,
    sharerLabel = "",
    handleShareClick,
    onAddParticipantsClick,
    userRole = "participant",
    handleKickParticipant,
    handleEndMeeting,
    liveParticipants = [],
    userId,
}) => {
    const [isKickDialogOpen, setIsKickDialogOpen] = React.useState(false);
    const [isHostControlsOpen, setIsHostControlsOpen] = React.useState(false);
    return (
        <footer className="h-[95px] bg-[#f8fafc] border-t border-slate-100 flex items-center justify-between px-6 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.015)]">
            {/* LEFT */}
            <div className="flex-1 flex items-center gap-3 justify-start min-w-0">
                <span className="text-[11px] uppercase tracking-wide font-bold text-slate-400 shrink-0">
                    Meet ID
                </span>

                <div
                    onClick={() => {
                        if (meetingId) {
                            navigator.clipboard.writeText(meetingId);
                            toast.success("Meeting ID copied to clipboard!");
                        }
                    }}
                    className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-sm transition-all duration-200 cursor-pointer active:scale-95 hover:shadow-md min-w-0 max-w-[240px]"
                >
                    <span className="truncate">{meetingId || "Unknown"}</span>
                    <Copy size={14} className="shrink-0" />
                </div>
            </div>

            {/* CENTER */}
            <div className="bg-white px-5 py-3 rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.05)] flex items-center gap-3 border border-slate-100 animate-slide-up shrink-0">
                {/* MIC */}
                <div className="flex items-center bg-slate-50 hover:bg-slate-100/60 rounded-xl px-1 transition-colors duration-200">
                    <button
                        onClick={toggleMic}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                            isMicOn
                                ? "text-slate-600 hover:bg-slate-100"
                                : "bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-red-600"
                        }`}
                    >
                        {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                    </button>

                    <ChevronDown
                        size={15}
                        className="text-slate-400 hover:text-slate-650 cursor-pointer transition-all duration-200 mr-2 hover:scale-110"
                    />
                </div>

                {/* VIDEO */}
                <div className="flex items-center bg-slate-50 hover:bg-slate-100/60 rounded-xl px-1 transition-colors duration-200">
                    <button
                        onClick={toggleVideo}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                            isVideoOn
                                ? "text-slate-600 hover:bg-slate-100"
                                : "bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-red-600"
                        }`}
                    >
                        {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
                    </button>

                    <ChevronDown
                        size={15}
                        className="text-slate-400 hover:text-slate-650 cursor-pointer transition-all duration-200 mr-2 hover:scale-110"
                    />
                </div>

                {/* SHARE */}
                <button
                    onClick={handleShareClick}
                    disabled={isAnotherUserSharing && !isLocalScreenSharing}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-205 cursor-pointer hover:scale-110 active:scale-95 hover:shadow-sm border border-transparent hover:border-slate-100 ${
                        isAnotherUserSharing && !isLocalScreenSharing
                            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                            : isLocalScreenSharing
                                ? "text-red-500 hover:bg-slate-100 border-slate-200 shadow-sm"
                                : "text-slate-600 hover:bg-slate-100"
                    }`}
                    title={
                        isAnotherUserSharing
                            ? `${sharerLabel} is already sharing`
                            : "Share screen"
                    }
                >
                    <Share size={18} />
                </button>

                <div className="w-px h-7 bg-slate-200"></div>

                {/* HAND */}
                <button
                    onClick={toggleHandRaise}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer ${
                        isHandRaised
                            ? "bg-yellow-400 text-black hover:bg-yellow-500 shadow-[0_2px_8px_rgba(250,204,21,0.3)]"
                            : "bg-white hover:bg-slate-100 border border-slate-100 hover:shadow-sm"
                    }`}
                >
                    <span className="text-[20px]">🤚</span>
                </button>

                {/* USER PLUS */}
                <button
                    onClick={onAddParticipantsClick}
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:scale-110 active:scale-95 transition-all duration-205 cursor-pointer hover:shadow-sm border border-transparent hover:border-slate-100"
                >
                    <UserPlus size={18} />
                </button>
                {/* HOST MODERATION */}
                {userRole === "host" ? (
                    <div className="flex items-center gap-1.5 bg-slate-100/60 hover:bg-slate-100 rounded-2xl px-1.5 py-0.5 border border-slate-200/50 transition-all duration-300">
                        {/* THREE DOTS BUTTON */}
                        <button
                            onClick={() => setIsHostControlsOpen(!isHostControlsOpen)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-250 cursor-pointer ${
                                isHostControlsOpen
                                    ? "bg-white text-indigo-600 shadow-sm border border-slate-150"
                                    : "text-slate-600 hover:bg-white/80"
                            }`}
                            title="Host Controls"
                        >
                            <MoreVertical
                                size={18}
                                className={`transition-transform duration-300 ${
                                    isHostControlsOpen ? "rotate-90 text-indigo-600 font-bold" : "text-slate-500"
                                }`}
                            />
                        </button>

                        {/* HOST CONTROLS INLINE EXPANSION */}
                        <div
                            className={`flex items-center gap-1.5 transition-all duration-300 ease-out overflow-hidden ${
                                isHostControlsOpen
                                    ? "max-w-[120px] opacity-100 ml-1"
                                    : "max-w-0 opacity-0 ml-0 pointer-events-none"
                            }`}
                        >
                            {/* KICK PARTICIPANT */}
                            <button
                                onClick={() => setIsKickDialogOpen(true)}
                                className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-red-100 shrink-0"
                                title="Kick Participant"
                            >
                                <UserMinus size={16} />
                            </button>

                            {/* END MEETING */}
                            <button
                                onClick={() => {
                                    if (window.confirm("Are you sure you want to end the meeting for all participants?")) {
                                        handleEndMeeting();
                                    }
                                }}
                                className="w-[34px] h-[34px] rounded-lg flex items-center justify-center bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all cursor-pointer shadow-sm shrink-0"
                                title="End Meeting for All"
                            >
                                <PhoneOff size={15} />
                            </button>
                        </div>
                    </div>
                ) : (
                    // Regular user view gets the standard non-functional three-dots icon
                    <div className="w-11 h-11 flex items-center justify-center text-slate-300">
                        <MoreVertical size={18} />
                    </div>
                )}
            </div>

            {/* RIGHT */}
            <div className="flex-1 flex items-center gap-3 justify-end min-w-0">
                <button className="w-11 h-11 rounded-xl border border-slate-250 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-blue-450 hover:scale-105 active:scale-95 transition-all duration-200 shadow-sm cursor-pointer hover:shadow-md">
                    <FilePenLine size={18} />
                </button>

                {/* MENU */}
                <button
                    onClick={() => {
                        setShowMenuPage(!showMenuPage);
                        setShowParticipants(false);
                        setShowHandRaise(false);
                    }}
                    className="w-11 h-11 rounded-xl border border-slate-250 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-blue-450 hover:scale-105 active:scale-95 transition-all duration-200 shadow-sm cursor-pointer hover:shadow-md"
                >
                    <LayoutGrid size={18} />
                </button>
            </div>

            {/* KICK PARTICIPANT DIALOG MODAL */}
            <Dialog open={isKickDialogOpen} onOpenChange={setIsKickDialogOpen}>
                <DialogContent className="w-[380px] p-6 bg-white border border-slate-200 rounded-3xl shadow-2xl z-[99999] text-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-slate-900">
                            Kick a Participant
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="mt-4 max-h-[220px] overflow-y-auto flex flex-col gap-2">
                        {liveParticipants.filter(p => p.user_id !== userId).length === 0 ? (
                            <div className="text-xs text-slate-400 py-4 text-center italic">
                                No other participants in the meeting
                            </div>
                        ) : (
                            liveParticipants
                                .filter(p => p.user_id !== userId)
                                .map((p) => {
                                    const cleanName = p.name ? p.name.replace(/_[a-zA-Z0-9]{5}$/, "") : "Guest";
                                    return (
                                        <div
                                            key={p.id || p.user_id}
                                            className="flex items-center justify-between w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-100 transition-all"
                                        >
                                            <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">
                                                {cleanName}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setIsKickDialogOpen(false);
                                                    handleKickParticipant(p.user_id, cleanName);
                                                }}
                                                className="text-xs text-red-500 font-bold hover:text-red-700 cursor-pointer bg-transparent border-none hover:underline"
                                            >
                                                Kick
                                            </button>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </footer>
    );
};

export default Footer;
