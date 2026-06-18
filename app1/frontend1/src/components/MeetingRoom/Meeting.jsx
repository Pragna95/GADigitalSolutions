import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";

// Subcomponents
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import VideoStage from "./VideoStage.jsx";
import Sidebar from "./Sidebar.jsx";
import ScreenShareModule from "./ScreenShareModule.jsx";

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
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordingStopped, setRecordingStopped] = useState(false);

    const [isMicOn, setIsMicOn] = useState(true);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [handRaisedUsers, setHandRaisedUsers] = useState({});
    const handRaiseMembers = Object.values(handRaisedUsers);
    const handRaiseCount = Object.keys(handRaisedUsers).length;
    // Server-authoritative count synced in real-time via WebSocket (same across all tabs)
    const [liveHandRaiseCount, setLiveHandRaiseCount] = useState(0);
    const [handRaiseNotifications, setHandRaiseNotifications] = useState([]);
    const handRaiseTimers = useRef({});
    const participantWsRef = useRef(null);

    const [message, setMessage] = useState("");
    const [chatMessages, setChatMessages] = useState([
        { sender: "Rahul", text: "Can we start the demo?" },
        { sender: "Anika", text: "Sharing the screen now." },
    ]);

    const navigate = useNavigate();
    const { meeting_id } = useParams();
    const meetingId = meeting_id || "b40842cc-954a-4bc1-a9da-9036a03e7657";
    const [searchParams] = useSearchParams();
    const participantName = searchParams.get("name") || "Andaya";
    const displayName = participantName;

    // Unique user ID for screen share & participant tracking
    const userId = useRef(
        typeof crypto !== "undefined" && crypto.randomUUID
            ? `u-${crypto.randomUUID().slice(0, 8)}`
            : `u-${Math.random().toString(36).slice(2, 10)}`
    ).current;

    const meetingLink = meetingId;
    const API_URL = "http://127.0.0.1:8000/api/meetings";

    // WebRTC Camera/Mic states and refs
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const wsRef = useRef(null);
    const pcRefs = useRef({});
    const pendingIceCandidatesRef = useRef({});

    const [remoteStreams, setRemoteStreams] = useState([]);
    const [roomPeers, setRoomPeers] = useState({});
    const [localPeerId] = useState(() => `peer-${Math.random().toString(36).slice(2, 10)}`);
    const [isWebRtcReady, setIsWebRtcReady] = useState(false);

    const [roomParticipants, setRoomParticipants] = useState([
        { userId, name: displayName, isSelf: true },
    ]);
    const roomParticipantsRef = useRef([]);

    useEffect(() => {
        roomParticipantsRef.current = roomParticipants;
    }, [roomParticipants]);

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

    // setup getUserMedia
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
                console.log("Audio Tracks:", stream.getAudioTracks());
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

    // Camera/mic WebRTC socket setup
    useEffect(() => {
        if (!isWebRtcReady || !meetingId) {
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
                } else if (payload.event === "countUpdate" && typeof payload.count === "number") {
                    // Server-authoritative count broadcast — update all browsers in sync
                    setLiveHandRaiseCount(payload.count);
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

        window.addEventListener("beforeunload", cleanup);

        return () => {
            cleanup();
            window.removeEventListener("beforeunload", cleanup);
        };
    }, [meetingId, localPeerId, participantName, isWebRtcReady]);

    // ── Participant WebSocket: listens for grid updates and hand-raise counts ──
    useEffect(() => {
        if (!meetingId) return;

        const wsUrl = `ws://127.0.0.1:8000/ws/participants/${meetingId}/`;
        const pWs = new WebSocket(wsUrl);
        participantWsRef.current = pWs;

        pWs.onopen = () => {
            console.log("[ParticipantWS] Connected:", wsUrl);
            
            // 🔥 CRITICAL FIX 1: Announce we joined so the backend counts us in the grid!
            pWs.send(JSON.stringify({
                type: "participant_join",
                name: participantName
            }));
        };

        pWs.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                const data = msg;

                // 1. Maintain your existing Hand Raise Logic
                if (data.type === "hand_count_init" || data.type === "hand_count_update") {
                    const el = document.getElementById('hand-count');
                    if (el) el.innerText = data.count;
                    return;
                }
                if (data.type === "hand_raise") {
                    setHandRaisedUsers((prev) => {
                        const next = { ...prev };
                        if (data.is_raised) {
                            const name = data.user_name || `Guest ${data.user_id.slice(-4)}`;
                            next[data.user_id] = name;
                            if (data.user_id !== userId) {
                                showHandRaiseGhost(data.user_id, name);
                            }
                        } else {
                            delete next[data.user_id];
                            setHandRaiseNotifications((prev) => prev.filter((n) => n.uid !== data.user_id));
                        }
                        return next;
                    });
                } else if (msg.event === "countUpdate" && typeof msg.count === "number") {
                    setLiveHandRaiseCount(msg.count);
                } else if (msg.event === "state_changed" && msg.user_id && msg.user_id !== userId) {
                    setHandRaisedUsers((prev) => {
                        const next = { ...prev };
                        if (msg.hand_raised) {
                            const name = msg.username || `Guest ${msg.user_id.slice(-4)}`;
                            next[msg.user_id] = name;
                            showHandRaiseGhost(msg.user_id, name);
                        } else {
                            delete next[msg.user_id];
                        }
                        return next;
                    });
                }

                // 🔥 CRITICAL FIX 2: Listen for the dynamic participant grid list!
                if (msg.type === "participant_list") {
                    console.log("Live Grid Update from Backend:", msg.participants);
                    
                    setRoomPeers((prevPeers) => {
                        const next = { ...prevPeers };
                        
                        // Grab the unique connection IDs of everyone currently live
                        const liveWsIds = msg.participants.map(p => p.id);
                        
                        // Add any new users to the screen
                        msg.participants.forEach((p) => {
                            if (!next[p.id]) {
                                next[p.id] = { name: p.name, isWs: true };
                            }
                        });

                        // Remove anyone who closed their browser tab
                        Object.keys(next).forEach((key) => {
                            if (next[key].isWs && !liveWsIds.includes(key)) {
                                delete next[key];
                            }
                        });

                        return next;
                    });
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
    }, [meetingId, participantName, userId]);

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

    useEffect(() => {
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
            // Do NOT seed liveHandRaiseCount from DB here — DB data can be stale from
            // a previous session (hand_raised stays true if the user closed without lowering).
            // The correct count is broadcast by the server via countUpdate WebSocket event
            // whenever any participant state changes, including the reset-on-join call in
            // fetchParticipantState below.
        } catch (error) {
            console.error("Failed to fetch all participants:", error);
        }
    };

    const fetchParticipantState = async () => {
        try {
            const response = await axios.get(
                `${API_URL}/participant/${meetingId}/${userId}/`
            );

            const data = response.data.data;
            if (data) {
                setIsMicOn(data.mic_on);
                setIsVideoOn(data.video_on);
                // Always reset hand_raised to false on a fresh join regardless of the
                // DB value. The DB stores the state from the *previous* session (the user
                // may have closed without lowering their hand). Resetting here:
                //   1. Keeps local UI consistent (hand button not stuck as "raised").
                //   2. Calls updateParticipantState which removes this userId from the
                //      server cache's raised_set and broadcasts a fresh countUpdate to
                //      ALL browsers — correcting the stale "1" default count.
                setIsHandRaised(false);
                updateParticipantState(data.mic_on, data.video_on, false);
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log("New participant! Initializing local UI with default states.");
                updateParticipantState(true, true, false);
            } else {
                console.error("Failed to fetch participant state:", error);
            }
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
                    username: displayName,
                    mic_on: mic,
                    video_on: video,
                    hand_raised: hand,
                }
            );
        } catch (error) {
            console.warn("updateParticipantState failed:", error?.message);
        }
    };

    // Toggle Mic/Video with hardware track enablement
    const toggleMic = () => {
        const newMicState = !isMicOn;
        setIsMicOn(newMicState);
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((track) => {
                track.enabled = newMicState;
            });
        }
        updateParticipantState(newMicState, isVideoOn, isHandRaised);
    };

    const toggleVideo = () => {
        const newVideoState = !isVideoOn;
        setIsVideoOn(newVideoState);
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach((track) => {
                track.enabled = newVideoState;
            });
        }
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
            // Count is NOT updated here — liveHandRaiseCount is driven exclusively
            // by the server's countUpdate WebSocket broadcast so every browser
            // (including this one) receives the same authoritative value.
            return next;
        });

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: "hand_raise",
                user_id: userId,
                user_name: displayName,
                is_raised: newHand
            }));
        }

        updateParticipantState(isMicOn, isVideoOn, newHand);
    };

    // Screen sharing state synchronized from ScreenShareModule
    const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
    const [isAnotherUserSharing, setIsAnotherUserSharing] = useState(false);
    const [sharerLabel, setSharerLabel] = useState("");
    const isScreenSharing = isLocalScreenSharing || isAnotherUserSharing;

    const [screenShareNotice, setScreenShareNotice] = useState("");
    const screenShareNoticeTimerRef = useRef(null);

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
            {/* ✋ HAND RAISE GHOST NOTIFICATIONS */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col-reverse items-center gap-3 pointer-events-none">
                {handRaiseNotifications.map((notif) => (
                    <div
                        key={notif.id}
                        className="flex items-center gap-3 bg-white/95 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.18)] rounded-2xl px-5 py-3 animate-hand-raise-ghost"
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

            {screenShareNotice && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-xl z-50 shadow-lg">
                    {screenShareNotice}
                </div>
            )}

            <Header
                isRecording={isRecording}
                setIsRecording={setIsRecording}
                recordingStopped={recordingStopped}
                setRecordingStopped={setRecordingStopped}
                recordingTime={recordingTime}
                setRecordingTime={setRecordingTime}
                formatTime={formatTime}
            />

            <main className="flex-1 p-4 flex gap-4 min-h-0 overflow-hidden relative">
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
                    participantName={displayName}
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

                    meetingId={meetingId}
                    userId={userId}
                    participantName={participantName}
                />

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
                isLocalScreenSharing={isLocalScreenSharing}
                isAnotherUserSharing={isAnotherUserSharing}
                sharerLabel={sharerLabel}
                handleShareClick={handleShareClick}
            />
        </div>
    );
};

export default Meeting;
