import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Video } from "lucide-react";

export default function ThankYou() {
    const navigate = useNavigate();
    const location = useLocation();

    const { company, letter, api_key, meetingId, role, name } = location.state || {};

    const handleGoHome = () => {
        const token = localStorage.getItem("token");
        if (token) {
            navigate("/dashboard");
        } else {
            navigate("/");
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FB] flex flex-col items-center justify-center p-6 font-sans">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 flex flex-col">
                <div className="h-48 w-full bg-slate-100 relative">
                    <img
                        src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800"
                        alt="Thank you"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
                <div className="p-8 text-center space-y-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                            You left the Huddle
                        </h1>
                        <p className="text-slate-500 font-medium mt-2">
                            Thank you for participating! The meeting has ended for you.
                        </p>
                    </div>

                    <div className="flex gap-3 w-full">
                        {meetingId && (
                            <Button
                                onClick={() => {
                                    if (company && letter && api_key) {
                                        navigate(`/${company}/${letter}/${api_key}/room/${meetingId}?name=${encodeURIComponent(name || "Guest")}&role=${role || "guest"}`);
                                    } else {
                                        navigate(`/room/${meetingId}?name=${encodeURIComponent(name || "Guest")}&role=${role || "guest"}`);
                                    }
                                }}
                                className="flex-1 bg-white hover:bg-slate-50 text-[#1e2b72] border border-[#1e2b72]/20 py-6 h-12 rounded-xl font-bold transition-all duration-200 text-base flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <Video size={18} />
                                Join Again
                            </Button>
                        )}
                        <Button
                            onClick={handleGoHome}
                            className="flex-1 bg-[#1e2b72] hover:bg-[#152060] text-white py-6 h-12 rounded-xl font-bold transition-all duration-200 text-base flex items-center justify-center gap-2 cursor-pointer shadow-md"
                        >
                            <Home size={18} />
                            Return to Home
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
