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
} from "lucide-react";

const Footer = ({
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
}) => {
    return (
        <footer className="h-[95px] bg-[#f8fafc] border-t border-slate-100 flex items-center justify-between px-6 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.015)]">
            {/* LEFT */}
            <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-wide font-bold text-slate-400">
                    Meet ID
                </span>

                <div className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-sm transition-all duration-200 cursor-pointer active:scale-95 hover:shadow-md">
                    NFT-rdtve9
                    <Copy size={14} />
                </div>
            </div>

            {/* CENTER */}
            <div className="bg-white px-5 py-3 rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.05)] flex items-center gap-3 border border-slate-100 animate-slide-up">
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
                <button className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:scale-110 active:scale-95 transition-all duration-205 cursor-pointer hover:shadow-sm border border-transparent hover:border-slate-100">
                    <UserPlus size={18} />
                </button>

                {/* MORE */}
                <button className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:scale-110 active:scale-95 transition-all duration-205 cursor-pointer hover:shadow-sm border border-transparent hover:border-slate-100">
                    <MoreVertical size={18} />
                </button>
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-3">
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
        </footer>
    );
};

export default Footer;
