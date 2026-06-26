import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { microserviceApi } from "../../services/api.js";
import { toast } from "react-hot-toast";
import { Room, RoomEvent, Track } from "livekit-client";

// Derive WebSocket base URL from the current browser host so it works everywhere:
// localhost dev, ngrok tunnels, LAN IPs — no env var needed.
const wsBaseUrl = (() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
})();

const apiBaseUrl = import.meta.env.VITE_MICROSERVICE_URL || "http://localhost:8000";
const API_URL = `${apiBaseUrl}/api/meetings`;

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
    const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false); // kept for compat
    const [showAddParticipant, setShowAddParticipant] = useState(false);
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
    const lkRoomRef = useRef(null);

    const [remoteStreams, setRemoteStreams] = useState([]);
    const [roomPeers, setRoomPeers] = useState({});
    const [remoteMicStates, setRemoteMicStates] = useState({});
    const [liveParticipants, setLiveParticipants] = useState([]);
    const [isWebRtcReady, setIsWebRtcReady] = useState(false);

    const remoteStreamsRef = useRef({}); // { participantIdentity: MediaStream }

    const updateRemoteParticipantStream = (participant) => {
        const identity = participant.identity;
        
        let stream = remoteStreamsRef.current[identity];
        if (!stream) {
            stream = new MediaStream();
            remoteStreamsRef.current[identity] = stream;
        }

        const tracks = [];
        participant.trackPublications.forEach(pub => {
            if (pub.track && pub.track.mediaStreamTrack) {
                tracks.push(pub.track.mediaStreamTrack);
            }
        });

        const currentTracks = stream.getTracks();
        currentTracks.forEach(t => {
            if (!tracks.includes(t)) {
                stream.removeTrack(t);
            }
        });
        tracks.forEach(t => {
            if (!currentTracks.includes(t)) {
                stream.addTrack(t);
            }
        });

        if (stream.getTracks().length === 0) {
            delete remoteStreamsRef.current[identity];
            setRemoteStreams(prev => prev.filter(item => item.peerId !== identity));
            setRoomPeers(prev => {
                const next = { ...prev };
                delete next[identity];
                return next;
            });
        } else {
            setRemoteStreams(prev => {
                const exists = prev.some(item => item.peerId === identity);
                if (exists) {
                    return prev.map(item => item.peerId === identity ? { peerId: identity, stream } : item);
                }
                return [...prev, { peerId: identity, stream }];
            });
            setRoomPeers(prev => {
                if (!prev[identity]) {
                    const cleanName = participant.name || `Guest ${identity.slice(-4)}`;
                    return { ...prev, [identity]: { name: cleanName, user_id: identity } };
                }
                return prev;
            });
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
                setIsHandRaised(false);
                updateParticipantState(data.mic_on, data.video_on, false);
                return data;
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log("New participant! Initializing local UI with default states.");
                updateParticipantState(true, true, false);
            } else {
                console.error("Failed to fetch participant state:", error);
            }
        }
        return { mic_on: true, video_on: true };
    };

    // LiveKit SFU setup and event routing
    useEffect(() => {
        let active = true;
        const room = new Room({
            adaptiveStream: true,
            dynacast: true,
        });
        lkRoomRef.current = room;

        const connectRoom = async () => {
            try {
                // Fetch the initial state first to avoid state closure mismatch
                let initialMic = true;
                let initialVideo = true;
                try {
                    const initialState = await fetchParticipantState();
                    initialMic = initialState.mic_on;
                    initialVideo = initialState.video_on;
                } catch (e) {
                    console.warn("Failed to fetch initial participant state:", e);
                }

                let token = "";
                let url = "";
                try {
                    // 1. Fetch token from backend
                    const tokenResponse = await microserviceApi.post(`/api/meetings/token/`, {
                        meeting_id: meetingId,
                        user_id: userId,
                        name: participantName,
                        role: "participant"
                    });
                    token = tokenResponse.data.token;
                    url = tokenResponse.data.url;
                } catch (e) {
                    console.warn("Failed to fetch LiveKit token from backend:", e);
                }

                if (!active) return;

                if (url && token) {
                    try {
                        // 2. Connect to LiveKit SFU Server
                        await room.connect(url, token);
                        console.log("LiveKit Room Connected:", room.name);

                        // 3. Register listeners
                        const syncMicState = (publication, participant) => {
                            if (publication.kind === "audio") {
                                setRemoteMicStates(prev => ({
                                    ...prev,
                                    [participant.identity]: !publication.isMuted
                                }));
                            }
                        };

                        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                            updateRemoteParticipantStream(participant);
                            syncMicState(publication, participant);
                        });
                        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                            updateRemoteParticipantStream(participant);
                        });
                        room.on(RoomEvent.TrackMuted, (publication, participant) => {
                            syncMicState(publication, participant);
                        });
                        room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
                            syncMicState(publication, participant);
                        });
                        room.on(RoomEvent.ParticipantConnected, (participant) => {
                            updateRemoteParticipantStream(participant);
                        });
                        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
                            delete remoteStreamsRef.current[participant.identity];
                            setRemoteStreams(prev => prev.filter(item => item.peerId !== participant.identity));
                            setRoomPeers(prev => {
                                const next = { ...prev };
                                delete next[participant.identity];
                                return next;
                            });
                            setRemoteMicStates(prev => {
                                const next = { ...prev };
                                delete next[participant.identity];
                                return next;
                            });
                        });

                        // 4. Publish local audio/video tracks
                        await room.localParticipant.setMicrophoneEnabled(initialMic);
                        await room.localParticipant.setCameraEnabled(initialVideo);

                        // Construct local MediaStream for UI video tag
                        const localStream = new MediaStream();

                        for (const pub of room.localParticipant.videoTrackPublications.values()) {
                            if (pub.track?.mediaStreamTrack) {
                                localStream.addTrack(pub.track.mediaStreamTrack);
                            }
                        }
                        for (const pub of room.localParticipant.audioTrackPublications.values()) {
                            if (pub.track?.mediaStreamTrack) {
                                localStream.addTrack(pub.track.mediaStreamTrack);
                            }
                        }

                        localStreamRef.current = localStream;
                        if (localVideoRef.current) {
                            localVideoRef.current.srcObject = localStream;
                        }

                        setIsWebRtcReady(true);
                        return; // Successfully connected to LiveKit!
                    } catch (lkErr) {
                        console.error("LiveKit connection attempt failed:", lkErr);
                    }
                }
            } catch (err) {
                console.error("Critical failure during connectRoom:", err);
                toast.error("Failed to join meeting room.");
            }
        };

        connectRoom();

        return () => {
            active = false;
            room.disconnect();
            if (lkRoomRef.current === room) {
                lkRoomRef.current = null;
            }
        };
    }, [meetingId, userId, participantName]);

    // ── Participant WebSocket: listens for countUpdate AND live participant grid ──
    useEffect(() => {
        if (!meetingId) return;

        let socket = null;
        let reconnectTimeout = null;
        let retryCount = 0;
        const maxRetries = 10;
        let isUnmounted = false;
        let toastId = null;

        const connect = () => {
            if (isUnmounted) return;
            const wsUrl = `${wsBaseUrl}/ws/participants/${meetingId}/`;
            socket = new WebSocket(wsUrl);
            participantWsRef.current = socket;

            socket.onopen = () => {
                if (isUnmounted) {
                    socket.close();
                    return;
                }
                console.log("[ParticipantWS] Connected:", wsUrl);
                retryCount = 0;
                if (toastId) {
                    toast.success("Reconnected to meeting!", { id: toastId });
                    toastId = null;
                }
                socket.send(JSON.stringify({
                    type: "participant_join",
                    name: participantName,
                    user_id: userId
                }));
            };

            socket.onmessage = (event) => {
                if (isUnmounted) return;
                try {
                    const msg = JSON.parse(event.data);
                    
                    if (msg.event === "countUpdate" && typeof msg.count === "number") {
                        setLiveHandRaiseCount(msg.count);
                    }

                    if (msg.type === "participant_list") {
                        console.log("Live Grid Update:", msg.participants);
                        setLiveParticipants(msg.participants);
                        
                        setRoomPeers((prevPeers) => {
                            const next = { ...prevPeers };
                            const liveIds = msg.participants.map(p => p.id);
                            
                            msg.participants.forEach((p) => {
                                if (!next[p.id]) {
                                    next[p.id] = { name: p.name, isWs: true };
                                }
                            });

                            Object.keys(next).forEach((key) => {
                                if (next[key].isWs && !liveIds.includes(key)) {
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

            socket.onerror = (err) => {
                console.warn("[ParticipantWS] error", err);
            };

            socket.onclose = (event) => {
                if (isUnmounted) return;
                console.log("[ParticipantWS] closed:", event.code, event.reason);
                participantWsRef.current = null;

                if (retryCount < maxRetries) {
                    retryCount++;
                    const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
                    console.log(`[ParticipantWS] Retrying connection in ${backoffTime}ms (Attempt ${retryCount}/${maxRetries})`);
                    if (!toastId) {
                        toastId = toast.loading("Connection lost. Reconnecting...", { id: "ws-reconnect-part" });
                    }
                    reconnectTimeout = setTimeout(connect, backoffTime);
                } else {
                    if (toastId) {
                        toast.error("Failed to connect to meeting. Please refresh the page.", { id: toastId });
                    } else {
                        toast.error("Failed to connect to meeting. Please refresh the page.");
                    }
                }
            };
        };

        connect();

        return () => {
            isUnmounted = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (socket) {
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                }
            }
            participantWsRef.current = null;
            if (toastId) toast.dismiss(toastId);
        };
    }, [meetingId, participantName, userId]);

    const updateParticipantState = async (mic, video, hand) => {
        try {
            const apiKey = import.meta.env.VITE_X_API_KEY || sessionStorage.getItem("api_key") || localStorage.getItem("api_key") || "";
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

    const toggleMic = async () => {
        const newMicState = !isMicOn;
        setIsMicOn(newMicState);
        if (lkRoomRef.current && lkRoomRef.current.state === "connected") {
            await lkRoomRef.current.localParticipant.setMicrophoneEnabled(newMicState);
        }
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((track) => {
                track.enabled = newMicState;
            });
        }
        updateParticipantState(newMicState, isVideoOn, isHandRaised);
    };

    const toggleVideo = async () => {
        const newVideoState = !isVideoOn;
        setIsVideoOn(newVideoState);
        if (lkRoomRef.current && lkRoomRef.current.state === "connected") {
            await lkRoomRef.current.localParticipant.setCameraEnabled(newVideoState);
        }
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach((track) => {
                track.enabled = newVideoState;
            });
        }
        updateParticipantState(isMicOn, newVideoState, isHandRaised);
    };

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
                    isMicOn={isMicOn}
                    remoteMicStates={remoteMicStates}
                    remoteStreams={remoteStreams}
                    roomPeers={roomPeers}
                    handRaiseCount={liveHandRaiseCount}
                    liveParticipants={liveParticipants}
                    userId={userId}
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
                    showAddParticipant={showAddParticipant}
                    setShowAddParticipant={setShowAddParticipant}
                    handRaiseMembers={handRaiseMembers}
                    participantMembers={participantMembers}
                    setShowParticipantsGridDirect={setShowParticipantsGrid}
                    liveParticipants={liveParticipants}
                    userId={userId}
                    participantName={participantName}
                    meetingId={meetingId}
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
                onAddParticipantsClick={() => { setShowAddParticipant(true); setShowParticipants(false); setShowHandRaise(false); setShowMenuPage(false); }}
            />


        </div>
    );
};

export default MeetingRoom;
