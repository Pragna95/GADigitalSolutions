import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    Share,
    UserPlus,
    MoreVertical,
    Copy,
    PhoneOff,
    Circle,
    LayoutGrid,
    FilePenLine,
    Monitor,
    ChevronDown,
    Search,
    X,
    SendHorizontal,
} from "lucide-react";
import ScreenShareModule from "./ScreenShareModule";

const handRaiseMembers = [
    "Rahul",
    "Anika",
    "James",
    "Priya",
    "Michael",
    "Fatima",
    "Kevin",
    "Sofia",
];

const participantMembers = [
    "Rahul",
    "Anika",
    "James",
    "Priya",
    "Michael",
    "Fatima",
    "Kevin",
    "Sofia",
    "John",
    "Emma",
    "David",
    "Sophia",
    "Chris",
    "Olivia",
    "Daniel",
    "Mia",
    "Ethan",
    "Lily",
    "Noah",
    "Ava",
];

const Meeting = () => {
    const displayName = useRef("Andaya").current;

    const userId = useRef(
        typeof crypto !== "undefined" && crypto.randomUUID
            ? `u-${crypto.randomUUID().slice(0, 8)}`
            : `u-${Math.random().toString(36).slice(2, 10)}`
    ).current;

    const meetingId = "meeting_001";
    const meetingLink = meetingId;
    const API_URL = "http://127.0.0.1:8000/api/meetings";

    const [showHandRaise, setShowHandRaise] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [showParticipantsGrid, setShowParticipantsGrid] = useState(false);
    const [showMenuPage, setShowMenuPage] = useState(false);
    const [activeMenu, setActiveMenu] = useState("assistance");
    const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordingStopped, setRecordingStopped] = useState(false);

    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isHandRaised, setIsHandRaised] = useState(false);

    const [message, setMessage] = useState("");
    const [chatMessages, setChatMessages] = useState([
        { sender: "Rahul", text: "Can we start the demo?" },
        { sender: "Anika", text: "Sharing the screen now." },
    ]);

    const [roomParticipants, setRoomParticipants] = useState([
        { userId, name: displayName, isSelf: true },
    ]);

    const [isLoadingState, setIsLoadingState] = useState(true);
    const [screenShareNotice, setScreenShareNotice] = useState("");
    const screenShareNoticeTimerRef = useRef(null);

    // Screen sharing state synchronized from ScreenShareModule
    const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
    const [isAnotherUserSharing, setIsAnotherUserSharing] = useState(false);
    const [sharerLabel, setSharerLabel] = useState("");
    const isScreenSharing = isLocalScreenSharing || isAnotherUserSharing;

    const roomParticipantsRef = useRef([]);

    useEffect(() => {
        roomParticipantsRef.current = roomParticipants;
    }, [roomParticipants]);

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    useEffect(() => {
        let interval;
        if (isRecording) {
            interval = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    // PARTICIPANT WEBSOCKET
    useEffect(() => {
        console.log("Creating WebSocket...");
        const socket = new WebSocket(
            `ws://127.0.0.1:8000/ws/participants/${meetingId}/`,
        );

        socket.onopen = () => {
            console.log("WebSocket Connected");
        };

        socket.onmessage = (event) => {
            console.log("Message:", JSON.parse(event.data));
        };

        socket.onerror = (error) => {
            console.log("WebSocket Error:", error);
        };

        socket.onclose = (event) => {
            console.log("WebSocket Closed", event.code, event.reason);
        };

        return () => {
            console.log("Cleaning up WebSocket");
        };
    }, []);

    useEffect(() => {
        fetchParticipantState();
    }, []);

    const fetchParticipantState = async () => {
        try {
            const response = await axios.get(
                `${API_URL}/participant/${meetingId}/${userId}/`
            );

            const data = response.data.data;
            if (data) {
                setIsMicOn(data.mic_on);
                setIsVideoOn(data.video_on);
                setIsHandRaised(data.hand_raised);
                console.log("Participant Loaded", data);
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log("New participant! Initializing local UI with default states.");
                updateParticipantState(true, true, false);
            } else {
                console.error("Failed to fetch participant state:", error);
            }
        } finally {
            setIsLoadingState(false);
        }
    };

    const updateParticipantState = async (mic, video, hand) => {
        if (!meetingId || !userId) return;
        try {
            await axios.post(
                `${API_URL}/participant/update/`,
                {
                    user_id: userId,
                    meeting_id: meetingId,
                    mic_on: mic,
                    video_on: video,
                    hand_raised: hand,
                },
                { validateStatus: (s) => s < 500 }
            );
        } catch (error) {
            console.warn("updateParticipantState failed:", error?.response?.status, error?.message);
        }
    };

    const showScreenShareNotice = (text) => {
        setScreenShareNotice(text);
        if (screenShareNoticeTimerRef.current) {
            clearTimeout(screenShareNoticeTimerRef.current);
        }
        screenShareNoticeTimerRef.current = setTimeout(() => {
            setScreenShareNotice("");
        }, 3000);
    };

    useEffect(() => {
        return () => {
            if (screenShareNoticeTimerRef.current) {
                clearTimeout(screenShareNoticeTimerRef.current);
            }
        };
    }, []);

    // Bridge listeners to receive state changes from ScreenShareModule
    useEffect(() => {
        const handleStateUpdate = (e) => {
            const { isLocalScreenSharing, isAnotherUserSharing, sharerLabel } = e.detail;
            setIsLocalScreenSharing(isLocalScreenSharing);
            setIsAnotherUserSharing(isAnotherUserSharing);
            setSharerLabel(sharerLabel);
        };
        window.addEventListener("screen-share-state-update", handleStateUpdate);
        return () => {
            window.removeEventListener("screen-share-state-update", handleStateUpdate);
        };
    }, []);

    const handleShareClick = () => {
        if (isAnotherUserSharing) {
            showScreenShareNotice(
                `${sharerLabel} is already sharing the screen. Only one participant can share at a time.`
            );
            return;
        }
        if (isLocalScreenSharing) {
            window.dispatchEvent(new CustomEvent("request-stop-screen-share"));
        } else {
            window.dispatchEvent(new CustomEvent("request-start-screen-share"));
        }
    };

    const handleSendMessage = () => {
        if (message.trim() === "") return;
        setChatMessages((prev) => [...prev, { sender: "You", text: message }]);
        setMessage("");
    };

    return (
        <div className="h-screen w-screen bg-[#f4f4f5] flex flex-col overflow-hidden font-sans">
            {/* ================= HEADER ================= */}
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
                        className={`ml-5 flex items-center gap-2 px-4 py-2 h-[40px] rounded-[8px] text-[14px] font-semibold border transition-all duration-300 ${
                            isRecording
                                ? "bg-[#D14343] text-white border-[#D14343]"
                                : "bg-white text-[#D14343] border-[#D14343] hover:bg-red-50"
                        }`}
                    >
                        <Circle
                            size={10}
                            fill={
                                isRecording ? "white" : recordingStopped ? "#ef4444" : "#D14343"
                            }
                            color={
                                isRecording ? "white" : recordingStopped ? "#ef4444" : "#D14343"
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
                <button className="bg-[#D14343] hover:bg-[#a51f1f] transition text-white px-4 h-[40px] rounded-[8px] flex items-center gap-2 text-[16px] font-bold shadow-sm">
                    Leave Huddle
                    <PhoneOff size={18} />
                </button>
            </header>

            {/* ================= BODY ================= */}
            <main className="flex-1 p-4 flex gap-4 min-h-0 overflow-hidden">
                {/* ================= MAIN AREA ================= */}
                <div
                    className={`relative rounded-[28px] overflow-hidden bg-black shadow-sm h-full transition-all duration-300 ${
                        showParticipantsGrid
                            ? "w-full"
                            : showHandRaise || showParticipants || showMenuPage
                                ? "w-[80%]"
                                : "w-full"
                    }`}
                >
                    {screenShareNotice && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-xl z-50 shadow-lg">
                            {screenShareNotice}
                        </div>
                    )}

                    {/* ================= PARTICIPANTS GRID ================= */}
                    {showParticipantsGrid ? (
                        <div className="w-full h-full bg-[#0f172a] p-6 overflow-y-auto">
                            {/* TOP BAR */}
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-white text-2xl font-bold">
                                    All Participants
                                </h2>

                                <button
                                    onClick={() => setShowParticipantsGrid(false)}
                                    className="bg-white text-slate-700 px-5 py-2 rounded-2xl text-sm font-semibold hover:bg-slate-100 transition"
                                >
                                    Back to Meeting
                                </button>
                            </div>

                            {/* GRID */}
                            <div className="grid grid-cols-4 gap-5">
                                {participantMembers.map((member, index) => (
                                    <div
                                        key={index}
                                        className="relative h-[240px] rounded-[28px] overflow-hidden border border-slate-700 bg-slate-900"
                                    >
                                        <img
                                            src={`https://randomuser.me/api/portraits/${
                                                index % 2 === 0 ? "men" : "women"
                                            }/${index + 20}.jpg`}
                                            alt={member}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/20"></div>
                                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                                            <div className="bg-black/40 backdrop-blur-xl px-3 py-1 rounded-xl text-white text-sm font-medium">
                                                {member}
                                            </div>
                                            <div className="bg-black/40 p-2 rounded-full">
                                                <MicOff size={15} className="text-white" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            <ScreenShareModule
                                userId={userId}
                                displayName={displayName}
                                meetingId={meetingId}
                                meetingLink={meetingLink}
                                roomParticipants={roomParticipants}
                                setRoomParticipants={setRoomParticipants}
                                roomParticipantsRef={roomParticipantsRef}
                                isMicOn={isMicOn}
                            />
                            {!isScreenSharing && (
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
                                            className="relative w-[96px] h-[40px]"
                                        >
                                            {/* Avatar 1 */}
                                            <img
                                                src="https://randomuser.me/api/portraits/women/65.jpg"
                                                alt=""
                                                className="absolute left-0 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md"
                                            />

                                            {/* Avatar 2 */}
                                            <img
                                                src="https://randomuser.me/api/portraits/men/60.jpg"
                                                alt=""
                                                className="absolute left-7 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md"
                                            />

                                            {/* +3 */}
                                            <div className="absolute left-[56px] top-0 w-10 h-10 rounded-[12px] border-2 border-white bg-[#ACBFFF] flex items-center justify-center shadow-md">
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
                                                className="bg-white h-[38px] px-4 rounded-[22px] flex items-center justify-center shadow-lg"
                                            >
                                                <span className="text-[22px] font-semibold leading-none text-black">
                                                    ✋ 12
                                                </span>
                                            </button>

                                            {/* AVATAR STACK */}
                                            <div className="relative w-[96px] h-[40px]">
                                                {/* Avatar 1 */}
                                                <img
                                                    src="https://randomuser.me/api/portraits/women/33.jpg"
                                                    alt=""
                                                    className="absolute left-0 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md"
                                                />

                                                {/* Avatar 2 */}
                                                <img
                                                    src="https://randomuser.me/api/portraits/men/33.jpg"
                                                    alt=""
                                                    className="absolute left-7 top-0 w-10 h-10 rounded-[12px] border-2 border-white object-cover shadow-md"
                                                />

                                                {/* +3 */}
                                                <div className="absolute left-[56px] top-0 w-10 h-10 rounded-[12px] border-2 border-white bg-[#ACBFFF] flex items-center justify-center shadow-md">
                                                    <span className="text-[12px] font-semibold text-[#394C84]">
                                                        +3
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* NAME */}
                                    <h1 className="absolute bottom-7 left-7 text-white text-[38px] font-bold drop-shadow-lg z-20">
                                        Andaya
                                    </h1>

                                    {/* SMALL VIDEO */}
                                    <div className="absolute bottom-5 right-5 w-[220px] h-[140px] rounded-[40px] bg-[#1f1f24] backdrop-blur-2xl border border-white/10 flex items-center justify-center z-20 shadow-2xl">
                                        <div className="text-center">
                                            <div className="w-16 h-16 rounded-full bg-blue-900 text-white flex items-center justify-center mx-auto font-bold text-lg border border-blue-500">
                                                AD
                                            </div>
                                            <p className="text-white text-sm font-semibold mt-3">
                                                Andaya
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* ================= SIDEBAR ================= */}
                {(showHandRaise || showParticipants) &&
                    !showParticipantsGrid &&
                    !showMenuPage && (
                        <div className="w-[20%] bg-white rounded-[24px] border border-slate-200 p-4 flex flex-col h-full">
                            {/* TOP */}
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-[17px] font-semibold text-slate-700">
                                    {showHandRaise ? "Hand Raise" : "Participants"}
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowHandRaise(false);
                                        setShowParticipants(false);
                                    }}
                                    className="w-6 h-6 border border-slate-300 rounded flex items-center justify-center text-slate-500"
                                >
                                    ×
                                </button>
                            </div>

                            {/* SEARCH */}
                            <div className="relative mb-4">
                                <Search
                                    size={15}
                                    className="absolute left-3 top-3 text-slate-400"
                                />
                                <input
                                    type="text"
                                    placeholder="search"
                                    className="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 text-sm outline-none"
                                />
                            </div>

                            {/* COUNT */}
                            <p className="text-sm text-slate-500 mb-4">
                                {showHandRaise ? "12 Members" : "40 Participants"}
                            </p>

                            {/* MEMBERS */}
                            <div className="space-y-3 overflow-y-auto flex-1">
                                {(showHandRaise
                                    ? handRaiseMembers
                                    : participantMembers.slice(0, 8)
                                ).map((member, index) => (
                                    <div
                                        key={index}
                                        className="border border-slate-300 rounded-xl px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition"
                                    >
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`https://randomuser.me/api/portraits/${
                                                    index % 2 === 0 ? "men" : "women"
                                                }/${index + 20}.jpg`}
                                                alt={member}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                            <span className="text-sm font-medium text-slate-700">
                                                {member}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* VIEW ALL PARTICIPANTS */}
                            {!showHandRaise && (
                                <button
                                    onClick={() => setShowParticipantsGrid(true)}
                                    className="mt-5 bg-[#0f172a] text-white py-3 rounded-2xl text-sm font-semibold hover:bg-slate-800 transition"
                                >
                                    View All Participants
                                </button>
                            )}
                        </div>
                    )}

                {/* ================= MENU PAGE ================= */}
                {showMenuPage && (
                    <div className="w-[20%] bg-white rounded-[24px] border border-slate-200 p-4 h-full flex flex-col">
                        {/* HEADER */}
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                            <h2 className="text-[18px] font-semibold text-slate-700">
                                Menu
                            </h2>
                            <button
                                onClick={() => setShowMenuPage(false)}
                                className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* TABS */}
                        <div className="mt-5 bg-[#f3f4f6] rounded-full p-1 flex items-center">
                            <button
                                onClick={() => setActiveMenu("chat")}
                                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                                    activeMenu === "chat"
                                        ? "bg-[#0f2a78] text-white"
                                        : "text-slate-500"
                                }`}
                            >
                                Chat
                            </button>
                            <button
                                onClick={() => setActiveMenu("notes")}
                                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                                    activeMenu === "notes"
                                        ? "bg-[#0f2a78] text-white"
                                        : "text-slate-500"
                                }`}
                            >
                                Notes
                            </button>
                            <button
                                onClick={() => setActiveMenu("assistance")}
                                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                                    activeMenu === "assistance"
                                        ? "bg-[#0f2a78] text-white"
                                        : "text-slate-500"
                                }`}
                            >
                                AI
                            </button>
                        </div>

                        {/* CONTENT */}
                        <div className="mt-5 flex-1 overflow-hidden flex flex-col">
                            {/* CHAT */}
                            {activeMenu === "chat" && (
                                <div className="flex flex-col h-full">
                                    <div className="flex-1 overflow-y-auto space-y-4">
                                        {chatMessages.map((msg, index) => (
                                            <div
                                                key={index}
                                                className={`flex ${
                                                    msg.sender === "You" ? "justify-end" : "justify-start"
                                                }`}
                                            >
                                                <div
                                                    className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                                                        msg.sender === "You"
                                                            ? "bg-[#0f2a78] text-white"
                                                            : "bg-slate-100 text-slate-700"
                                                    }`}
                                                >
                                                    <p className="text-xs font-semibold mb-1">
                                                        {msg.sender}
                                                    </p>
                                                    <p className="text-sm">{msg.text}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* INPUT */}
                                    <div className="mt-4 flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder="Type a message..."
                                            className="flex-1 border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none"
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            className="w-12 h-12 rounded-2xl bg-[#0f2a78] text-white flex items-center justify-center"
                                        >
                                            <SendHorizontal size={18} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* NOTES */}
                            {activeMenu === "notes" && (
                                <textarea
                                    placeholder="Write meeting notes..."
                                    className="w-full h-full border border-slate-300 rounded-2xl p-4 outline-none resize-none"
                                ></textarea>
                            )}

                            {/* AI */}
                            {activeMenu === "assistance" && (
                                <div className="flex flex-col gap-4">
                                    <div className="bg-slate-100 rounded-2xl p-4 flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-slate-700">
                                                AI Transcription
                                            </p>
                                            <p className="text-sm text-slate-500 mt-1">
                                                Live captions enabled
                                            </p>
                                        </div>
                                        <button
                                            onClick={() =>
                                                setTranscriptionEnabled(!transcriptionEnabled)
                                            }
                                            className={`w-14 h-7 rounded-full flex items-center px-1 transition ${
                                                transcriptionEnabled
                                                    ? "bg-[#0f2a78]"
                                                    : "bg-slate-300"
                                            }`}
                                        >
                                            <div
                                                className={`w-5 h-5 rounded-full bg-white transition ${
                                                    transcriptionEnabled ? "translate-x-7" : ""
                                                }`}
                                            ></div>
                                        </button>
                                    </div>

                                    {/* LIVE TRANSCRIPTION */}
                                    {transcriptionEnabled && (
                                        <div className="space-y-3">
                                            <div className="bg-slate-100 rounded-2xl p-4">
                                                <p className="text-xs font-semibold text-blue-700 mb-1">
                                                    LIVE
                                                </p>
                                                <p className="text-sm text-slate-700">
                                                    Rahul: Let's begin the sprint review meeting.
                                                </p>
                                            </div>
                                            <div className="bg-slate-100 rounded-2xl p-4">
                                                <p className="text-xs font-semibold text-blue-700 mb-1">
                                                    LIVE
                                                </p>
                                                <p className="text-sm text-slate-700">
                                                    Anika: Sharing the analytics dashboard now.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* ================= FOOTER ================= */}
            <footer className="h-[95px] bg-[#f8fafc] border-t border-slate-200 flex items-center justify-between px-6 shrink-0">
                {/* LEFT */}
                <div className="flex items-center gap-3">
                    <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                        Meet ID
                    </span>
                    <div className="bg-slate-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-sm">
                        NFT-rdtve9
                        <Copy size={14} />
                    </div>
                </div>

                {/* CENTER */}
                <div className="bg-white px-5 py-3 rounded-[24px] shadow-md flex items-center gap-3 border border-slate-100">
                    {/* MIC */}
                    <div className="flex items-center bg-slate-50 rounded-xl px-1">
                        <button
                            onClick={() => {
                                const newMicState = !isMicOn;
                                setIsMicOn(newMicState);
                                updateParticipantState(newMicState, isVideoOn, isHandRaised);
                            }}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
                                isMicOn
                                    ? "text-slate-600 hover:bg-slate-100"
                                    : "text-red-500 hover:bg-slate-100"
                            }`}
                        >
                            {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                        </button>
                        <ChevronDown size={15} className="text-slate-400 mr-2" />
                    </div>

                    {/* VIDEO */}
                    <div className="flex items-center bg-slate-50 rounded-xl px-1">
                        <button
                            onClick={() => {
                                const newVideoState = !isVideoOn;
                                setIsVideoOn(newVideoState);
                                updateParticipantState(isMicOn, newVideoState, isHandRaised);
                            }}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
                                isVideoOn
                                    ? "text-slate-600 hover:bg-slate-100"
                                    : "text-red-500 hover:bg-slate-100"
                            }`}
                        >
                            {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
                        </button>
                        <ChevronDown size={15} className="text-slate-400 mr-2" />
                    </div>

                    {/* SHARE */}
                    <button
                        onClick={handleShareClick}
                        disabled={isAnotherUserSharing && !isLocalScreenSharing}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
                            isAnotherUserSharing && !isLocalScreenSharing
                                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                : isLocalScreenSharing
                                    ? "text-red-500"
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
                        onClick={() => {
                            const newHand = !isHandRaised;
                            setIsHandRaised(newHand);
                            updateParticipantState(isMicOn, isVideoOn, newHand);
                        }}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
                            isHandRaised
                                ? "bg-yellow-400 text-black hover:bg-yellow-500"
                                : "bg-white hover:bg-slate-100"
                        }`}
                    >
                        <span className="text-[20px]">🤚</span>
                    </button>

                    {/* USER PLUS */}
                    <button className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 transition">
                        <UserPlus size={18} />
                    </button>

                    {/* MORE */}
                    <button className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 transition">
                        <MoreVertical size={18} />
                    </button>
                </div>

                {/* RIGHT */}
                <div className="flex items-center gap-3">
                    <button className="w-11 h-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition shadow-sm">
                        <FilePenLine size={18} />
                    </button>

                    {/* MENU */}
                    <button
                        onClick={() => {
                            setShowMenuPage(!showMenuPage);
                            setShowParticipants(false);
                            setShowHandRaise(false);
                        }}
                        className="w-11 h-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition shadow-sm"
                    >
                        <LayoutGrid size={18} />
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default Meeting;
