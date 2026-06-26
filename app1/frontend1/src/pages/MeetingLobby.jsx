import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
    ChevronLeft,
    Mic,
    MicOff,
    Video,
    VideoOff,
    RefreshCw,
    AlertCircle,
} from "lucide-react";
import { microserviceApi } from "@/services/api";
import placeholderImg from "../assets/placeholder.png";
export default function MeetingLobby() {
    const { company, letter, api_key, meeting_id, meetingCode, meetingId, } = useParams();
    const actualMeetingId = meeting_id || meetingId;
    const actualMeetingCode = meetingCode;
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [isValid, setIsValid] = useState(null);
    const [meetingDetails, setMeetingDetails] = useState(null);

    const [name, setName] = useState("");
    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);

    const videoRef = useRef(null);
    const streamRef = useRef(null);

    useEffect(() => {
        const startMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing media devices.", err);
            }
        };

        startMedia();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    useEffect(() => {
        const toggleMedia = async () => {
            if (streamRef.current) {
                streamRef.current.getAudioTracks().forEach((track) => {
                    track.enabled = micOn;
                });

                if (videoOn) {
                    const videoTracks = streamRef.current.getVideoTracks();
                    // If there are no active video tracks, request a new one
                    if (videoTracks.length === 0 || videoTracks.every(t => t.readyState === 'ended')) {
                        try {
                            const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
                            newStream.getVideoTracks().forEach(track => {
                                streamRef.current.addTrack(track);
                            });
                            // Re-attach to trigger update
                            if (videoRef.current) {
                                videoRef.current.srcObject = null;
                                videoRef.current.srcObject = streamRef.current;
                            }
                        } catch (err) {
                            console.error("Error accessing camera.", err);
                        }
                    } else {
                        videoTracks.forEach(track => { track.enabled = true; });
                        if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
                            videoRef.current.srcObject = streamRef.current;
                        }
                    }
                } else {
                    // Turn off video completely to disable camera hardware
                    streamRef.current.getVideoTracks().forEach((track) => {
                        track.stop();
                        streamRef.current.removeTrack(track);
                    });
                }
            }
        };

        toggleMedia();
    }, [videoOn, micOn]);

    // Check if current user is logged in as a host (legacy React auth)
    const currentUserId = localStorage.getItem("user_id");

    const loggedInName =
        localStorage.getItem("name") ||
        localStorage.getItem("username") ||
        "User";

    // Check if user has passed through microservice authentication
    const isMicroserviceAuth =
        sessionStorage.getItem("microservice_authenticated") === "true";

    useEffect(() => {
        const token = localStorage.getItem("token");
        const isLoggedIn = !!token && token !== "null" && token !== "undefined";

        // ALWAYS enforce microservice authentication for deep links (unless already logged in)
        if (api_key && !isMicroserviceAuth && !isLoggedIn) {
            const frontendUrl = window.location.origin;
            const targetUrl = `${frontendUrl}/auth-return?redirect=/${company}/${letter || 'a'}/${api_key}/${meeting_id}`;
            // /api/login/ is proxied by Vite to localhost:8000 — no hardcoded origin needed
            window.location.href = `/api/login/?next=${encodeURIComponent(targetUrl)}`;
            return;
        }

        const validateMeeting = async () => {
            try {
                let response;
                if (company) {
                    response = await microserviceApi.get(
                        `/api/meeting/validate/${company}/${api_key}/${meeting_id}`,
                    );
                } else {
                    response = await microserviceApi.get(
                        `/api/meeting/validate-lobby/${actualMeetingId}/`,
                    );

                }
                console.log(JSON.stringify(response.data, null, 2));
                console.log("Meeting creator:", response.data.created_by);
                console.log(
                    "Logged in user:",
                    localStorage.getItem("user_id")
                );
                setMeetingDetails(response.data);
                console.log(JSON.stringify(response.data, null, 2));
                console.log(
                    "Logged User:",
                    localStorage.getItem("user_id")
                );
                setIsValid(true);
            } catch (err) {
                console.error(err);
                setIsValid(false);
            } finally {
                setLoading(false);
            }
        };
        validateMeeting();
    }, [company, api_key, meeting_id]);
    const loggedInEmail = localStorage.getItem("email");

    const isLoggedIn = !!localStorage.getItem("token");

    const isHost =
        isLoggedIn &&
        meetingDetails &&
        meetingDetails.created_by_email?.toLowerCase() ===
        loggedInEmail?.toLowerCase();

    const isUser = isLoggedIn && !isHost;

    const handleJoin = (e) => {
        e.preventDefault();

        const finalName = isLoggedIn
            ? loggedInName
            : name.trim();

        if (!finalName) {
            alert("Please enter your name to join the meeting.");
            return;
        }

        const role = isHost
            ? "host"
            : (isLoggedIn ? "user" : "guest");

        const comp = company || meetingDetails?.company || "huddle";
        const lettr = letter || "a";
        const key = api_key || meetingDetails?.api_key || "kTh35Mm1gA8lX4StIrpfYIvtmStj2XCUVMm3nIdrnU8";

        navigate(
            `/${comp}/${lettr}/${key}/room/${actualMeetingId}?name=${encodeURIComponent(finalName)}&role=${role}`
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
                <RefreshCw className="animate-spin text-[#1e2b72] size-10 mb-4" />
                <span className="text-lg font-semibold text-slate-600">
                    Validating meeting link...
                </span>
            </div>
        );
    }

    if (isValid === false) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full border border-red-100 shadow-xl rounded-2xl overflow-hidden bg-white">
                    <CardContent className="p-8 text-center space-y-6">
                        <div className="w-16 h-16 rounded-full bg-red-55 flex items-center justify-center mx-auto text-red-500 border border-red-100">
                            <AlertCircle className="size-8 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-slate-900">
                                Invalid Meeting Link
                            </h1>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                The meeting link you followed is invalid, has
                                expired, or is unauthorized. Please verify the
                                link or check with the organizer for a new
                                invitation.
                            </p>
                        </div>
                        <Button
                            onClick={() => navigate("/login")}
                            className="w-full bg-[#1e2b72] hover:bg-[#152060] text-white py-3 rounded-xl font-bold transition-all duration-200"
                        >
                            Return to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Fallback to today's date formatted nicely if meeting date isn't provided
    const meetingDate = meetingDetails?.datetime
        ? meetingDetails.datetime
        : new Date().toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });

    return (
        <div className="min-h-screen bg-[#F8F9FB] flex flex-col overflow-hidden font-sans">
            {/* ================= HEADER / TOP BAR ================= */}
            <header className="h-19.5 bg-white border-b border-slate-200/80 flex items-center justify-between px-6 shrink-0 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 border border-slate-200 hover:border-slate-350 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-slate-800 transition-all cursor-pointer flex items-center justify-center shadow-sm"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="leading-tight text-left">
                        <h2 className="text-lg font-bold text-slate-800">
                            {meetingDetails?.company_name || "Huddle"}
                        </h2>
                        <p className="text-[12px] text-slate-400 font-medium">
                            {meetingDate}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-indigo-50 text-[#1e2b72] px-3.5 py-1.5 rounded-full text-xs font-bold shadow-sm">
                    <span className="w-1.5 h-1.5 bg-[#1e2b72] rounded-full animate-ping" />
                    <span>Lobby View</span>
                </div>
            </header>

            {/* ================= MAIN CONTENT ================= */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10 flex flex-col lg:flex-row items-center justify-center gap-10 min-h-0 overflow-y-auto">
                {/* Left Side: Meeting Preview Image & Media Toggles */}
                <div className="flex-1 w-full max-w-2xl flex flex-col gap-4">
                    <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl w-full aspect-video flex items-center justify-center">
                        {videoOn ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover transform -scale-x-100"
                            />
                        ) : (
                            <div className="text-center p-6 space-y-4">
                                <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mx-auto shadow-inner overflow-hidden border-2 border-slate-700">
                                    <img src={placeholderImg} alt="User placeholder" className="w-full h-full object-cover" />
                                </div>
                                <p className="text-slate-400 font-medium text-sm">
                                    Your camera is off
                                </p>
                            </div>
                        )}

                        {/* Mic indicator badge */}
                        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center gap-2 shadow-md">
                            {micOn ? (
                                <>
                                    <Mic className="size-3.5 text-green-400" />
                                    <span>Microphone Active</span>
                                </>
                            ) : (
                                <>
                                    <MicOff className="size-3.5 text-red-400" />
                                    <span>Microphone Muted</span>
                                </>
                            )}
                        </div>

                        {/* Media Toggles overlays */}
                        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md border border-white/10 rounded-[20px] p-2 flex items-center gap-3 shadow-2xl">
                            <button
                                onClick={() => setMicOn(!micOn)}
                                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${micOn
                                    ? "bg-white/10 text-white hover:bg-white/20 border border-white/5"
                                    : "bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-red-650"
                                    }`}
                            >
                                {micOn ? (
                                    <Mic size={18} />
                                ) : (
                                    <MicOff size={18} />
                                )}
                            </button>

                            <button
                                onClick={() => setVideoOn(!videoOn)}
                                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${videoOn
                                    ? "bg-white/10 text-white hover:bg-white/20 border border-white/5"
                                    : "bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-red-655"
                                    }`}
                            >
                                {videoOn ? (
                                    <Video size={18} />
                                ) : (
                                    <VideoOff size={18} />
                                )}
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 text-center font-medium">
                        Take a moment to adjust your camera and microphone
                        settings before joining.
                    </p>
                </div>

                {/* Right Side: Meeting Details Card & Form */}
                <div className="w-full max-w-md shrink-0">
                    <Card className="border border-slate-150 shadow-xl rounded-3xl overflow-hidden bg-white">
                        <CardContent className="p-8 space-y-6 text-left">
                            <div className="space-y-2 border-b border-slate-100 pb-5">
                                <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                                    Upcoming Huddle
                                </span>
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-2 leading-tight">
                                    {meetingDetails?.title ||
                                        "Architecture Review"}
                                </h1>
                                <p className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                                    Start Time:{" "}
                                    {meetingDetails?.datetime || "Today"}
                                </p>
                            </div>

                            {/* Participants avatar row */}
                            <div className="space-y-2">
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                                    Invited Participants (
                                    {meetingDetails?.participants?.length || 0})
                                </span>
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2.5 overflow-hidden">
                                        {(meetingDetails?.participants || [])
                                            .slice(0, 4)
                                            .map((email, idx) => (
                                                <img
                                                    key={idx}
                                                    className="inline-block h-8 w-8 rounded-full ring-2 ring-white"
                                                    src={`https://i.pravatar.cc/100?u=${encodeURIComponent(email)}`}
                                                    alt={email}
                                                    title={email}
                                                />
                                            ))}
                                        {(meetingDetails?.participants || [])
                                            .length > 4 && (
                                                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-slate-500 ring-2 ring-white text-[11px] font-extrabold">
                                                    +
                                                    {(
                                                        meetingDetails?.participants ||
                                                        []
                                                    ).length - 4}
                                                </div>
                                            )}
                                    </div>
                                    <span className="text-xs text-slate-500 font-semibold truncate max-w-50 ml-1">
                                        {(meetingDetails?.participants || [])
                                            .slice(0, 2)
                                            .join(", ")}
                                        {(meetingDetails?.participants || [])
                                            .length > 2 && "..."}
                                    </span>
                                </div>
                            </div>

                            {/* Form container */}
                            <form
                                onSubmit={handleJoin}
                                className="space-y-4 pt-2"
                            >
                                {!isLoggedIn ? (
                                    <div className="space-y-1.5 text-left">

                                        <label>
                                            Enter your name
                                        </label>

                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                        />

                                    </div>
                                ) : (

                                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">

                                        <p className="text-xs text-indigo-800">

                                            You are logged in as{" "}

                                            <span className="font-extrabold">
                                                {loggedInName}
                                            </span>

                                            .{" "}

                                            {isHost
                                                ? "You will bypass name registration and enter as the host."
                                                : "You will bypass name registration and enter as the user."
                                            }

                                        </p>

                                    </div>

                                )}

                                <Button
                                    type="submit"
                                    className="w-full bg-[#1e2b72] hover:bg-[#152060] text-white py-3 rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 h-12 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    Join Room
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
