import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../../services/api.js";
import { toast } from "react-hot-toast";

// Subcomponents
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import VideoStage from "./VideoStage.jsx";
import Sidebar from "./Sidebar.jsx";

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

const MeetingRoom = () => {
    const [showHandRaise, setShowHandRaise] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [showParticipantsGrid, setShowParticipantsGrid] = useState(false);
    const [showMenuPage, setShowMenuPage] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [handRaisedUsers, setHandRaisedUsers] = useState({});
    const handRaiseMembers = Object.values(handRaisedUsers);
    const handRaiseCount = Object.keys(handRaisedUsers).length;
    // Server-authoritative count synced in real-time via WebSocket
    const [liveHandRaiseCount, setLiveHandRaiseCount] = useState(0);
    const [handRaiseNotifications, setHandRaiseNotifications] = useState([]);
    const handRaiseTimers = useRef({});
    const participantWsRef = useRef(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordingStopped, setRecordingStopped] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [participants, setParticipants] = useState({});
    const [isLoadingState, setIsLoadingState] = useState(true);
    const navigate = useNavigate();
    const { meeting_id } = useParams();
    const meetingId = meeting_id || "b40842cc-954a-4bc1-a9da-9036a03e7657";
    const [searchParams] = useSearchParams();
    const participantName = searchParams.get("name") || "Andaya";
    const displayName = participantName;

    // Unique user ID for participant state tracking
    const userId = useRef(
        typeof crypto !== "undefined" && crypto.randomUUID
            ? `u-${crypto.randomUUID().slice(0, 8)}`
            : `u-${Math.random().toString(36).slice(2, 10)}`
    ).current;

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
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                    video: true,
                });
                console.log(
                    "Audio Tracks:",
                    stream.getAudioTracks()
                );
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
        if (!isWebRtcReady || !meetingId) {
            if (!meetingId) {
                console.warn("Meeting ID missing, skipping websocket setup.");
            }
            return;
        }

        const socket = new WebSocket(
            `ws://127.0.0.1:8000/ws/audio/${meetingId}/`
        );
        wsRef.current = socket;

        socket.onopen = () => {
            console.log("WebSocket Connected");
            sendSignal({ type: "join", name: participantName });
        };

        socket.onmessage = async (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.event === "state_changed") {
                    const { user_id, username, hand_raised } = payload;
                    if (user_id && user_id !== userId) {
                        setHandRaisedUsers((prev) => {
                            const next = { ...prev };
                            if (hand_raised) {
                                const displayedName = username || `Guest ${user_id.slice(-4)}`;
                                next[user_id] = displayedName;
                                showHandRaiseGhost(user_id, displayedName);
                            } else {
                                delete next[user_id];
                                setHandRaiseNotifications((prev) => prev.filter((n) => n.uid !== user_id));
                                if (handRaiseTimers.current[user_id]) {
                                    clearTimeout(handRaiseTimers.current[user_id]);
                                    delete handRaiseTimers.current[user_id];
                                }
                            }
                            return next;
                        });
                    }
                } else {
                    await handleSignalMessage(payload);
                }
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

        const toggleMic = () => {
        const newMicState = !isMicOn;
        setIsMicOn(newMicState);
        
        // THE FIX: Actually disable the hardware audio track
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = newMicState;
            });
        }
        
        updateParticipantState(newMicState, isVideoOn, isHandRaised);
    };

    const toggleVideo = () => {
        const newVideoState = !isVideoOn;
        setIsVideoOn(newVideoState);
        
        // THE FIX: Actually disable the hardware video track
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(track => {
                track.enabled = newVideoState;
            });
        }
        
        updateParticipantState(isMicOn, newVideoState, isHandRaised);
    };

        window.addEventListener("beforeunload", cleanup);

        return () => {
            cleanup();
            window.removeEventListener("beforeunload", cleanup);
        };
    }, [meetingId, localPeerId, participantName, isWebRtcReady]);

    // ── Participant WebSocket: listens for countUpdate (real-time hand-raise count) ──
    useEffect(() => {
        if (!meetingId) return;

        const wsUrl = `ws://127.0.0.1:8000/ws/participants/${meetingId}/`;
        const pWs = new WebSocket(wsUrl);
        participantWsRef.current = pWs;

        pWs.onopen = () => {
            console.log("[ParticipantWS] Connected:", wsUrl);
        };

        pWs.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.event === "countUpdate" && typeof msg.count === "number") {
                    // Server-authoritative hand-raise count — updates all tabs instantly
                    setLiveHandRaiseCount(msg.count);
                }
            } catch (err) {
                console.error("[ParticipantWS] parse error", err);
            }
        };

        pWs.onerror = (err) => console.warn("[ParticipantWS] error", err);
        pWs.onclose = () => console.log("[ParticipantWS] closed");

        return () => {
            if (pWs.readyState === WebSocket.OPEN || pWs.readyState === WebSocket.CONNECTING) {
                pWs.close();
            }
            participantWsRef.current = null;
        };
    }, [meetingId]);

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

    const API_URL = "http://127.0.0.1:8000/api/meetings";

    useEffect(() => {
        if (!meetingId) {
            console.warn("Missing meetingId, skipping participant state fetch.");
            return;
        }
        fetchParticipantState();
        fetchAllParticipants();
    }, [meetingId]);

    const fetchAllParticipants = async () => {
        try {
            const response = await axios.get(`${API_URL}/participants/${meetingId}/`);
            const participantsList = response.data.data || [];
            const initialHandRaised = {};
            participantsList.forEach((p) => {
                if (p.hand_raised) {
                    initialHandRaised[p.user_id] = p.username || `Guest ${p.user_id.slice(-4)}`;
                }
            });
            setHandRaisedUsers(initialHandRaised);
            // Seed the live count from initial participant data so badge shows immediately
            setLiveHandRaiseCount(Object.keys(initialHandRaised).length);
        } catch (error) {
            console.error("Failed to fetch all participants:", error);
        }
    };

    const fetchParticipantState = async () => {
        try {
            const apiKey = localStorage.getItem("api_key");
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
                if (data.hand_raised) {
                    setHandRaisedUsers((prev) => ({
                        ...prev,
                        [userId]: displayName,
                    }));
                }
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(
                    "New participant! Initializing local UI with default states.",
                );
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
            console.log("meetingId =", meetingId);
            await axios.post(
                `${API_URL}/participant/update/`,
                {
                    user_id: userId,
                    meeting_id: meetingId,
                    username: displayName,
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

    const toggleMic = () => {
        const newMicState = !isMicOn;
        setIsMicOn(newMicState);
        updateParticipantState(newMicState, isVideoOn, isHandRaised);
    };

    const toggleVideo = () => {
        const newVideoState = !isVideoOn;
        setIsVideoOn(newVideoState);
        updateParticipantState(isMicOn, newVideoState, isHandRaised);
    };

    const showHandRaiseGhost = (uid, name) => {
        const notifId = `${uid}-${Date.now()}`;
        setHandRaiseNotifications((prev) => [
            ...prev.filter((n) => n.uid !== uid),
            { id: notifId, uid, name },
        ]);
        if (handRaiseTimers.current[uid]) {
            clearTimeout(handRaiseTimers.current[uid]);
        }
        handRaiseTimers.current[uid] = setTimeout(() => {
            setHandRaiseNotifications((prev) => prev.filter((n) => n.uid !== uid));
            delete handRaiseTimers.current[uid];
        }, 4000);
    };

    const toggleHandRaise = () => {
        const newHand = !isHandRaised;
        setIsHandRaised(newHand);
        setHandRaisedUsers((prev) => {
            const next = { ...prev };
            if (newHand) {
                next[userId] = displayName;
                showHandRaiseGhost(userId, "You");
            } else {
                delete next[userId];
                setHandRaiseNotifications((prev) => prev.filter((n) => n.uid !== userId));
                if (handRaiseTimers.current[userId]) {
                    clearTimeout(handRaiseTimers.current[userId]);
                    delete handRaiseTimers.current[userId];
                }
            }
            // Optimistic update so the badge reacts instantly before WS round-trip
            setLiveHandRaiseCount(Object.keys(next).length);
            return next;
        });
        updateParticipantState(isMicOn, isVideoOn, newHand);
    };

    return (
        <div className="h-screen w-screen bg-[#f4f4f5] flex flex-col overflow-hidden font-sans">
            {/* ✋ HAND RAISE GHOST NOTIFICATIONS */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col-reverse items-center gap-3 pointer-events-none">
                {handRaiseNotifications.map((notif) => (
                    <div
                        key={notif.id}
                        className="flex items-center gap-3 bg-white/95 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.18)] rounded-2xl px-5 py-3"
                        style={{ animation: "handRaiseIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}
                    >
                        <span className="text-2xl animate-hand-wave">✋</span>
                        <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">
                                {notif.name === "You" ? "You raised your hand" : `${notif.name} raised their hand`}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Everyone can see this</p>
                        </div>
                    </div>
                ))}
            </div>

            <Header
                isRecording={isRecording}
                setIsRecording={setIsRecording}
                recordingStopped={recordingStopped}
                setRecordingStopped={setRecordingStopped}
                recordingTime={recordingTime}
                setRecordingTime={setRecordingTime}
                formatTime={formatTime}
            />

            <main className="flex-1 p-4 flex gap-4 min-h-0 overflow-hidden">
                <VideoStage
                    showParticipantsGrid={showParticipantsGrid}
                    setShowParticipantsGrid={setShowParticipantsGrid}
                    showHandRaise={showHandRaise}
                    showParticipants={showParticipants}
                    showMenuPage={showMenuPage}
                    setShowParticipants={setShowParticipants}
                    setShowHandRaise={setShowHandRaise}
                    setShowMenuPage={setShowMenuPage}
                    participantMembers={participantMembers}
                    participantName={participantName}
                    localVideoRef={localVideoRef}
                    isVideoOn={isVideoOn}
                    remoteStreams={remoteStreams}
                    roomPeers={roomPeers}
                    handRaiseCount={liveHandRaiseCount}
                />

                <Sidebar
                    showHandRaise={showHandRaise}
                    setShowHandRaise={setShowHandRaise}
                    showParticipants={showParticipants}
                    setShowParticipants={setShowParticipants}
                    showParticipantsGrid={showParticipantsGrid}
                    setShowParticipantsGrid={setShowParticipantsGrid}
                    showMenuPage={showMenuPage}
                    setShowMenuPage={setShowMenuPage}
                    handRaiseMembers={handRaiseMembers}
                    participantMembers={participantMembers}
                    setShowParticipantsGridDirect={setShowParticipantsGrid}
                />
            </main>

            <Footer
                isMicOn={isMicOn}
                toggleMic={toggleMic}
                isVideoOn={isVideoOn}
                toggleVideo={toggleVideo}
                isHandRaised={isHandRaised}
                toggleHandRaise={toggleHandRaise}
                showMenuPage={showMenuPage}
                setShowMenuPage={setShowMenuPage}
                setShowParticipants={setShowParticipants}
                setShowHandRaise={setShowHandRaise}
            />
        </div>
    );
};

export default MeetingRoom;
