import React from "react";
import { Monitor, Circle, PhoneOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Header = ({
    isRecording,
    setIsRecording,
    recordingStopped,
    setRecordingStopped,
    recordingTime,
    setRecordingTime,
    formatTime,
}) => {
    const navigate = useNavigate();

    return (
        <header className="h-[78px] bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
            {/* LEFT */}
            <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-[#0f172a] text-white flex items-center justify-center shadow-sm">
                    <Monitor size={22} fill="white" />
                </div>

                <div className="leading-tight">
                    <h2 className="text-[17px] font-bold text-slate-800">
                        Huddle_Name
                    </h2>
                    <p className="text-[12px] text-slate-400 mt-1">
                        Tuesday, 07-04-2026
                    </p>
                </div>

                <button
                    onClick={() => {
                        if (isRecording) {
                            setIsRecording(false);
                            setRecordingStopped(true);

                            setTimeout(() => {
                                setRecordingStopped(false);
                                setRecordingTime(0);
                            }, 2000);
                        } else {
                            setRecordingTime(0);
                            setIsRecording(true);
                        }
                    }}
                    className={`ml-5 flex items-center gap-2 px-4 py-2 h-[40px] rounded-lg text-[14px] font-bold border transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer hover:shadow-sm ${
                        isRecording
                            ? "bg-[#D14343] text-white border-[#D14343] shadow-[0_2px_8px_rgba(209,67,67,0.3)] animate-pulse-red"
                            : "bg-white text-[#D14343] border-[#D14343]/30 hover:bg-red-50"
                    }`}
                >
                    <Circle
                        size={8}
                        fill={
                            isRecording
                                ? "white"
                                : recordingStopped
                                  ? "#ef4444"
                                  : "#D14343"
                        }
                        color={
                            isRecording
                                ? "white"
                                : recordingStopped
                                  ? "#ef4444"
                                  : "#D14343"
                        }
                        className={isRecording ? "animate-pulse" : ""}
                    />

                    {isRecording
                        ? `REC ${formatTime(recordingTime)}`
                        : recordingStopped
                          ? "Stop Recording"
                          : "Start Recording"}
                </button>
            </div>

            {/* RIGHT */}
            <button
                onClick={() => navigate("/thank-you")}
                className="bg-[#D14343] hover:bg-[#b93232] hover:shadow-[0_4px_12px_rgba(209,67,67,0.3)] hover:-translate-y-0.5 active:translate-y-0 text-white px-4 h-[40px] rounded-lg flex items-center gap-2 text-[15px] font-bold shadow-sm transition-all duration-300 cursor-pointer"
            >
                Leave Huddle
                <PhoneOff size={16} />
            </button>
        </header>
    );
};

export default Header;
