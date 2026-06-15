import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../services/api.js";
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
    const [showHandRaise, setShowHandRaise] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [showParticipantsGrid, setShowParticipantsGrid] = useState(false);
    const [showMenuPage, setShowMenuPage] = useState(false);
    const [activeMenu, setActiveMenu] = useState("assistance");
    const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordingStopped, setRecordingStopped] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [participants, setParticipants] = useState({});
    const [isLoadingState, setIsLoadingState] = useState(true);
    const navigate = useNavigate();
    const { meeting_id } = useParams();
    const meetingId = meeting_id || "meeting_001";
    const [searchParams] = useSearchParams();
    const participantName = searchParams.get("name") || "Andaya";

    const getInitials = (nameStr) => {
        if (!nameStr) return "AD";
        const parts = nameStr.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return parts[0].substring(0, 2).toUpperCase();
    };
    const participantInitials = getInitials(participantName);

    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const wsRef = useRef(null);
    const pcRefs = useRef({});
    const pendingIceCandidatesRef = useRef({});

    const [message, setMessage] = useState("");
    const [remoteStreams, setRemoteStreams] = useState([]);
    const [roomPeers, setRoomPeers] = useState({});
    const [localPeerId] = useState(() => `peer-${Math.random().toString(36).slice(2, 10)}`);
    const [isWebRtcReady, setIsWebRtcReady] = useState(false);

    const peerConfig = useMemo(
        () => ({
            iceServers: [
                { urls: ["stun:stun.l.google.com:19302"] },
            ],
        }),
        [],
    );

    const addRemoteStream = (peerId, stream) => {
        setRemoteStreams((prev) => {
            if (prev.some((item) => item.peerId === peerId)) {
                return prev;
            }
            return [...prev, { peerId, stream }];
        });
    };

    const removePeer = (peerId) => {
        const pc = pcRefs.current[peerId];
        if (pc) {
            pc.close();
            delete pcRefs.current[peerId];
        }
        delete pendingIceCandidatesRef.current[peerId];
        setRemoteStreams((prev) => prev.filter((item) => item.peerId !== peerId));
        setRoomPeers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
        });
    };

    const sendSignal = (payload) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        socket.send(
            JSON.stringify({
                sender: localPeerId,
                meeting_id: meetingId,
                ...payload,
            }),
        );
    };

    const createPeerConnection = async (
        remotePeerId,
        sendOffer = false,
        remoteSdp = null,
        remoteSdpType = null,
    ) => {
        if (pcRefs.current[remotePeerId]) {
            return pcRefs.current[remotePeerId];
        }

        const pc = new RTCPeerConnection(peerConfig);
        pcRefs.current[remotePeerId] = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({
                    type: "ice",
                    target: remotePeerId,
                    candidate: event.candidate,
                });
            }
        };

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                addRemoteStream(remotePeerId, event.streams[0]);
            }
        };

        pc.onconnectionstatechange = () => {
            if (
                pc.connectionState === "failed" ||
                pc.connectionState === "disconnected" ||
                pc.connectionState === "closed"
            ) {
                removePeer(remotePeerId);
            }
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        if (remoteSdp) {
            await pc.setRemoteDescription({ type: remoteSdpType, sdp: remoteSdp });
            if (remoteSdpType === "offer") {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal({
                    type: "answer",
                    target: remotePeerId,
                    sdp: answer.sdp,
                    sdpType: answer.type,
                });
            }
            const queuedCandidates = pendingIceCandidatesRef.current[remotePeerId];
            if (queuedCandidates && queuedCandidates.length) {
                for (const candidate of queuedCandidates) {
                    try {
                        await pc.addIceCandidate(candidate);
                    } catch (err) {
                        console.warn("Queued ICE candidate failed", err);
                    }
                }
                delete pendingIceCandidatesRef.current[remotePeerId];
            }
        } else if (sendOffer) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({
                type: "offer",
                target: remotePeerId,
                sdp: offer.sdp,
                sdpType: offer.type,
            });
        }

        return pc;
    };

    const handleSignalMessage = async (message) => {
        if (!message || message.sender === localPeerId) {
            return;
        }

        const { type, sender, target } = message;
        if (target && target !== localPeerId) {
            return;
        }

        switch (type) {
            case "join": {
                setRoomPeers((prev) => ({
                    ...prev,
                    [sender]: {
                        name: message.name || `Guest ${sender.slice(-4)}`,
                    },
                }));
                if (localPeerId < sender) {
                    await createPeerConnection(sender, true);
                }
                break;
            }
            case "offer": {
                await createPeerConnection(sender, false, message.sdp, message.sdpType);
                break;
            }
            case "answer": {
                const pc = pcRefs.current[sender];
                if (pc) {
                    await pc.setRemoteDescription({ type: message.sdpType, sdp: message.sdp });
                }
                break;
            }
            case "ice": {
                const pc = pcRefs.current[sender];
                if (pc && message.candidate) {
                    try {
                        await pc.addIceCandidate(message.candidate);
                    } catch (error) {
                        console.warn("Failed to add ICE candidate", error);
                    }
                } else if (message.candidate) {
                    pendingIceCandidatesRef.current[sender] = [
                        ...(pendingIceCandidatesRef.current[sender] || []),
                        message.candidate,
                    ];
                }
                break;
            }
            case "leave": {
                removePeer(sender);
                break;
            }
            default:
                break;
        }
    };

    useEffect(() => {
        const setupMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });
                localStreamRef.current = stream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
                setIsWebRtcReady(true);
            } catch (err) {
                console.error("Error accessing media devices.", err);
            }
        };

        setupMedia();

        return () => {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (!isWebRtcReady) {
            return;
        }

        const socket = new WebSocket(
            `${api.defaults.baseURL.replace("http", "ws")}/ws/participants/${meetingId}/`,
        );
        wsRef.current = socket;

        socket.onopen = () => {
            console.log("WebSocket Connected");
            sendSignal({ type: "join", name: participantName });
        };

        socket.onmessage = async (event) => {
            try {
                const payload = JSON.parse(event.data);
                await handleSignalMessage(payload);
            } catch (err) {
                console.error("Invalid websocket message", err);
            }
        };

        socket.onerror = (error) => {
            console.log("WebSocket Error:", error);
        };

        socket.onclose = (event) => {
            console.log("WebSocket Closed", event.code, event.reason);
        };

        const cleanup = () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ sender: localPeerId, meeting_id: meetingId, type: "leave" }));
                socket.close();
            }
            Object.values(pcRefs.current).forEach((pc) => pc.close());
            wsRef.current = null;
        };

        window.addEventListener("beforeunload", cleanup);

        return () => {
            cleanup();
            window.removeEventListener("beforeunload", cleanup);
        };
    }, [meetingId, localPeerId, participantName, isWebRtcReady]);
    const [chatMessages, setChatMessages] = useState([
        {
            sender: "Rahul",
            text: "Can we start the demo?",
        },
        {
            sender: "Anika",
            text: "Sharing the screen now.",
        },
    ]);

    useEffect(() => {
        let interval;

        if (isRecording) {
            interval = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        }

        return () => clearInterval(interval);
    }, [isRecording]);

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    // SEND MESSAGE
    const handleSendMessage = () => {
        if (message.trim() === "") return;

        setChatMessages([
            ...chatMessages,
            {
                sender: "You",
                text: message,
            },
        ]);

        setMessage("");
    };
    const userId = 1;
    const API_URL = "http://127.0.0.1:8000/api/meetings";

    useEffect(() => {
        fetchParticipantState();
    }, []);

    const fetchParticipantState = async () => {
        try {
            const apiKey = localStorage.getItem("api_key");
            const userId = "042c3663-c7bb-4783-b2a5-71b715b342b2";
            const response = await axios.get(
                `${API_URL}/participant/${meetingId}/${userId}/`,
                {
                    headers: {
                        "X-API-Key": apiKey,
                    },
                },
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
                console.log(
                    "New participant! Initializing local UI with default states.",
                );

                // OPTIONAL: Immediately register them in the backend database
                updateParticipantState(true, true, false);
            } else {
                console.error("Failed to fetch participant state:", error);
            }
        } finally {
            setIsLoadingState(false);
        }
    };

    const updateParticipantState = async (mic, video, hand) => {
        try {
            const apiKey = localStorage.getItem("api_key");
            const userId = "042c3663-c7bb-4783-b2a5-71b715b342b2";
            // Crucial: Must be axios.post, NOT axios.get
            await axios.post(
                `${API_URL}/participant/update/`,
                {
                    user_id: userId,
                    meeting_id: meetingId,
                    mic_on: mic,
                    video_on: video,
                    hand_raised: hand,
                },
                {
                    headers: {
                        "X-API-Key": apiKey,
                    },
                },
            );
            console.log("Database State Updated successfully.");
        } catch (error) {
            console.error("Update Error:", error);
        }
    };

    const handleLeaveHuddle = () => {
        navigate("/dashboard", {
            state: { showThankYouDialog: true },
        });
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

            {/* ================= BODY ================= */}
            <main className="flex-1 p-4 flex gap-4 min-h-0 overflow-hidden">
                {/* ================= MAIN AREA ================= */}
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
                                    onClick={() =>
                                        setShowParticipantsGrid(false)
                                    }
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
                                                index % 2 === 0
                                                    ? "men"
                                                    : "women"
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

                {/* ================= SIDEBAR ================= */}
                {(showHandRaise || showParticipants) &&
                    !showParticipantsGrid &&
                    !showMenuPage && (
                        <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 flex flex-col h-full shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                            {/* TOP */}
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-[17px] font-bold text-slate-800">
                                    {showHandRaise
                                        ? "Hand Raise"
                                        : "Participants"}
                                </h2>

                                <button
                                    onClick={() => {
                                        setShowHandRaise(false);
                                        setShowParticipants(false);
                                    }}
                                    className="w-6 h-6 border border-slate-350 hover:border-slate-500 rounded flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
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
                                    className="w-full border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-xl py-2 pl-9 pr-3 text-sm outline-none transition-all duration-200"
                                />
                            </div>

                            {/* COUNT */}
                            <p className="text-sm font-semibold text-slate-500 mb-4">
                                {showHandRaise
                                    ? "12 Members"
                                    : "40 Participants"}
                            </p>

                            {/* MEMBERS */}
                            <div className="space-y-3 overflow-y-auto flex-1 dark-scroll">
                                {(showHandRaise
                                    ? handRaiseMembers
                                    : participantMembers.slice(0, 8)
                                ).map((member, index) => (
                                    <div
                                        key={index}
                                        className="border border-slate-100 rounded-xl px-3 py-2 flex items-center justify-between hover:bg-slate-50/80 hover:border-slate-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`https://randomuser.me/api/portraits/${
                                                    index % 2 === 0
                                                        ? "men"
                                                        : "women"
                                                }/${index + 20}.jpg`}
                                                className="w-10 h-10 rounded-full object-cover shadow-sm"
                                                alt=""
                                            />

                                            <span className="text-sm font-semibold text-slate-700">
                                                {member}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* VIEW ALL PARTICIPANTS */}
                            {!showHandRaise && (
                                <button
                                    onClick={() =>
                                        setShowParticipantsGrid(true)
                                    }
                                    className="mt-5 bg-[#0f172a] hover:bg-[#1e293b] active:scale-[0.98] text-white py-3 rounded-2xl text-sm font-bold shadow-sm transition-all duration-200 cursor-pointer"
                                >
                                    View All Participants
                                </button>
                            )}
                        </div>
                    )}

                {/* ================= MENU PAGE ================= */}
                {showMenuPage && (
                    <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 h-full flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right">
                        {/* HEADER */}
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                            <h2 className="text-[18px] font-bold text-slate-800">
                                Menu
                            </h2>

                            <button
                                onClick={() => setShowMenuPage(false)}
                                className="w-7 h-7 rounded-lg border border-slate-350 hover:border-slate-500 flex items-center justify-center hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* TABS */}
                        <div className="mt-5 bg-slate-100 rounded-full p-1 flex items-center shadow-inner">
                            <button
                                onClick={() => setActiveMenu("chat")}
                                className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
                                    activeMenu === "chat"
                                        ? "bg-[#0f2a78] text-white shadow-md"
                                        : "text-slate-500 hover:text-slate-850"
                                }`}
                            >
                                Chat
                            </button>

                            <button
                                onClick={() => setActiveMenu("notes")}
                                className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
                                    activeMenu === "notes"
                                        ? "bg-[#0f2a78] text-white shadow-md"
                                        : "text-slate-500 hover:text-slate-850"
                                }`}
                            >
                                Notes
                            </button>

                            <button
                                onClick={() => setActiveMenu("assistance")}
                                className={`flex-1 py-2 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
                                    activeMenu === "assistance"
                                        ? "bg-[#0f2a78] text-white shadow-md"
                                        : "text-slate-500 hover:text-slate-850"
                                }`}
                            >
                                AI
                            </button>
                        </div>

                        {/* CONTENT */}
                        <div className="mt-5 flex-1 overflow-hidden flex flex-col">
                            {/* CHAT */}
                            {activeMenu === "chat" && (
                                <div className="flex flex-col h-full animate-fade-in">
                                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 dark-scroll">
                                        {chatMessages.map((msg, index) => (
                                            <div
                                                key={index}
                                                className={`flex ${
                                                    msg.sender === "You"
                                                        ? "justify-end"
                                                        : "justify-start"
                                                }`}
                                            >
                                                <div
                                                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm ${
                                                        msg.sender === "You"
                                                            ? "bg-[#0f2a78] text-white rounded-tr-none"
                                                            : "bg-slate-100 text-slate-700 rounded-tl-none"
                                                    }`}
                                                >
                                                    <p className="text-[10px] font-bold mb-0.5 opacity-80">
                                                        {msg.sender}
                                                    </p>
                                                    <p className="text-sm leading-relaxed">
                                                        {msg.text}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* INPUT */}
                                    <div className="mt-4 flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={(e) =>
                                                setMessage(e.target.value)
                                            }
                                            placeholder="Type a message..."
                                            className="flex-1 border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-2xl px-4 py-3 text-sm outline-none transition-all duration-200"
                                        />

                                        <button
                                            onClick={handleSendMessage}
                                            className="w-12 h-12 rounded-2xl bg-[#0f2a78] hover:bg-[#153eac] hover:scale-105 active:scale-95 text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-md"
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
                                    className="w-full h-full border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 rounded-2xl p-4 outline-none resize-none transition-all duration-205 animate-fade-in"
                                ></textarea>
                            )}

                            {/* AI */}
                            {activeMenu === "assistance" && (
                                <div className="flex flex-col gap-4 animate-fade-in">
                                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                                        <div>
                                            <p className="font-bold text-slate-750">
                                                AI Transcription
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Live captions enabled
                                            </p>
                                        </div>

                                        <button
                                            onClick={() =>
                                                setTranscriptionEnabled(
                                                    !transcriptionEnabled,
                                                )
                                            }
                                            className={`w-14 h-7 rounded-full flex items-center px-1 transition-colors duration-300 cursor-pointer ${
                                                transcriptionEnabled
                                                    ? "bg-[#0f2a78]"
                                                    : "bg-slate-300"
                                            }`}
                                        >
                                            <div
                                                className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                                                    transcriptionEnabled
                                                        ? "translate-x-7"
                                                        : ""
                                                }`}
                                            ></div>
                                        </button>
                                    </div>

                                    {/* LIVE TRANSCRIPTION */}
                                    {transcriptionEnabled && (
                                        <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1 dark-scroll">
                                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                <p className="text-[10px] font-bold text-blue-700 mb-1 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                                                    LIVE
                                                </p>
                                                <p className="text-sm text-slate-700 leading-relaxed">
                                                    <span className="font-semibold">
                                                        Rahul:
                                                    </span>{" "}
                                                    Let's begin the sprint
                                                    review meeting.
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                <p className="text-[10px] font-bold text-blue-700 mb-1 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                                                    LIVE
                                                </p>
                                                <p className="text-sm text-slate-700 leading-relaxed">
                                                    <span className="font-semibold">
                                                        Anika:
                                                    </span>{" "}
                                                    Sharing the analytics
                                                    dashboard now.
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
                            onClick={() => {
                                const newMicState = !isMicOn;
                                setIsMicOn(newMicState);
                                updateParticipantState(
                                    newMicState,
                                    isVideoOn,
                                    isHandRaised,
                                );
                            }}
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
                            onClick={() => {
                                const newVideoState = !isVideoOn;
                                setIsVideoOn(newVideoState);
                                updateParticipantState(
                                    isMicOn,
                                    newVideoState,
                                    isHandRaised,
                                );
                            }}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                                isVideoOn
                                    ? "text-slate-600 hover:bg-slate-100"
                                    : "bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-red-600"
                            }`}
                        >
                            {isVideoOn ? (
                                <Video size={18} />
                            ) : (
                                <VideoOff size={18} />
                            )}
                        </button>

                        <ChevronDown
                            size={15}
                            className="text-slate-400 hover:text-slate-650 cursor-pointer transition-all duration-200 mr-2 hover:scale-110"
                        />
                    </div>

                    {/* SHARE */}
                    <button className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:scale-110 active:scale-95 transition-all duration-205 cursor-pointer hover:shadow-sm border border-transparent hover:border-slate-100">
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
        </div>
    );
};

export default Meeting;
