import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Room, RoomEvent, Track } from "livekit-client";

// Subcomponents
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import VideoStage from "./VideoStage.jsx";
import Sidebar from "./Sidebar.jsx";
import ScreenShareModule from "./ScreenShareModule.jsx";

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
    // ✅ Tracks every OTHER participant's mic state, keyed by user_id,
    // so each video box can show the real on/off icon instead of a hardcoded one.
    const [remoteMicStates, setRemoteMicStates] = useState({});
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [handRaisedUsers, setHandRaisedUsers] = useState({});
    const handRaiseMembers = Object.values(handRaisedUsers);
    const handRaiseCount = Object.keys(handRaisedUsers).length;
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

    // Generate unique random UUID per tab
    const generateFreshId = () => {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
            (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
        );
    };

    const userIdRef = useRef(undefined);
    if (userIdRef.current === undefined) {
        userIdRef.current = generateFreshId();
    }
    const userId = userIdRef.current;

    const meetingLink = meetingId;
    const API_URL = "http://127.0.0.1:8000/api/meetings";

    // Camera/Mic and LiveKit refs
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const lkRoomRef = useRef(null);
    const selfMonitorRef = useRef(null);

    const [remoteStreams, setRemoteStreams] = useState([]);
    const [roomPeers, setRoomPeers] = useState({});
    const [liveParticipants, setLiveParticipants] = useState([]);

    useEffect(() => {
        console.log("ROOM PEERS:", roomPeers);
        console.log("REMOTE STREAMS:", remoteStreams);
    }, [roomPeers, remoteStreams]);

    useEffect(() => {
        console.log("LIVE PARTICIPANTS STATE", participantName, liveParticipants.length, liveParticipants);
    }, [liveParticipants, participantName]);

    const [isWebRtcReady, setIsWebRtcReady] = useState(false);

    const [roomParticipants, setRoomParticipants] = useState([
        { userId, name: displayName, isSelf: true },
    ]);
    const roomParticipantsRef = useRef([]);

    useEffect(() => {
        roomParticipantsRef.current = roomParticipants;
    }, [roomParticipants]);

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
                const initialState = await fetchParticipantState();
                const initialMic = initialState.mic_on;
                const initialVideo = initialState.video_on;

                // 1. Fetch token from backend
                const tokenResponse = await axios.post("http://127.0.0.1:8000/api/meetings/token/", {
                    meeting_id: meetingId,
                    user_id: userId,
                    name: participantName,
                    role: "speaker"
                });
                const { token, url } = tokenResponse.data;

                if (!active) return;

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
                const localAudioStream = new MediaStream();

                for (const pub of room.localParticipant.videoTrackPublications.values()) {
                    if (pub.track?.mediaStreamTrack) {
                        localStream.addTrack(pub.track.mediaStreamTrack);
                    }
                }
                for (const pub of room.localParticipant.audioTrackPublications.values()) {
                    if (pub.track?.mediaStreamTrack) {
                        localStream.addTrack(pub.track.mediaStreamTrack);
                        localAudioStream.addTrack(pub.track.mediaStreamTrack);
                    }
                }

                localStreamRef.current = localStream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = localStream;
                }

                if (selfMonitorRef.current) {
                    selfMonitorRef.current.srcObject = localAudioStream;
                    if (initialMic) {
                        selfMonitorRef.current.play().catch(e => console.log("Self monitor play blocked:", e));
                    }
                }

                setIsWebRtcReady(true);
            } catch (err) {
                console.error("Failed to connect to LiveKit SFU:", err);
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

    // ── Participant WebSocket ──
    useEffect(() => {
        if (!meetingId) return;

        const wsUrl = `ws://127.0.0.1:8000/ws/participants/${meetingId}/`;
        const pWs = new WebSocket(wsUrl);
        participantWsRef.current = pWs;

        pWs.onopen = () => {
            console.log("[ParticipantWS] Connected:", wsUrl);
            pWs.send(JSON.stringify({
                type: "participant_join",
                name: participantName,
                user_id: userId
            }));
        };

        pWs.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                const data = msg;

                if (
                    data.type === "hand_count_init" ||
                    data.type === "hand_count_update"
                ) {
                    setLiveHandRaiseCount(data.count || 0);
                    return;
                }

                // ✅ FIX 2: ParticipantWS నుండి వచ్చే hand_raise events handle చేస్తున్నాం
                // ఇప్పుడు toggleHandRaise లో participantWsRef కి పంపుతున్నాం
                // కాబట్టి ఇక్కడ receive చేసి ghost notification చూపిస్తున్నాం
                if (data.type === "hand_raise") {
                    setHandRaisedUsers((prev) => {
                        const next = { ...prev };
                        if (data.is_raised) {
                            const name = data.user_name || `Guest ${data.user_id.slice(-4)}`;
                            next[data.user_id] = name;
                            // Self తప్ప అందరికీ ghost notification చూపించు
                            if (data.user_id !== userId) {
                                showHandRaiseGhost(data.user_id, name);
                            }
                        } else {
                            delete next[data.user_id];
                            setHandRaiseNotifications((prev) => prev.filter((n) => n.uid !== data.user_id));
                            if (handRaiseTimers.current[data.user_id]) {
                                clearTimeout(handRaiseTimers.current[data.user_id]);
                                delete handRaiseTimers.current[data.user_id];
                            }
                        }
                        return next;
                    });
                    return;
                }

                if (msg.event === "countUpdate" && typeof msg.count === "number") {
                    setLiveHandRaiseCount(msg.count);
                } else if (msg.event === "state_changed" && msg.user_id && msg.user_id !== userId) {
                    if (msg.mic_on !== undefined) {
                        setRemoteMicStates((prev) => ({
                            ...prev,
                            [msg.user_id]: msg.mic_on
                        }));
                    }
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

                // ✅ Join/Leave ghost notifications — అన్ని tabs కి broadcast వస్తుంది
                if (msg.type === "presence_event") {
                    const presenceName = msg.name || "Someone";
                    const isJoin = msg.event === "joined";
                    const notifId = `presence-${msg.user_id}-${Date.now()}`;
                    setHandRaiseNotifications((prev) => [
                        ...prev,
                        {
                            id: notifId,
                            uid: `presence-${msg.user_id}`,
                            name: presenceName,
                            isPresence: true,
                            presenceType: isJoin ? "joined" : "left",
                        }
                    ]);
                    setTimeout(() => {
                        setHandRaiseNotifications((prev) => prev.filter((n) => n.id !== notifId));
                    }, 4000);
                    return;
                }

                if (msg.type === "participant_list") {
                    console.log(
                        "PARTICIPANT LIST RECEIVED",
                        participantName,
                        msg.participants.length,
                        msg.participants
                    );
                    setLiveParticipants(msg.participants);
                    setRoomPeers((prevPeers) => {
                        const next = { ...prevPeers };
                        const liveWsIds = msg.participants.map(p => p.id);
                        msg.participants.forEach((p) => {
                            if (!next[p.id]) {
                                next[p.id] = { name: p.name, isWs: true };
                            }
                        });
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

    const toggleMic = async () => {
        const newMicState = !isMicOn;
        setIsMicOn(newMicState);
        if (lkRoomRef.current) {
            await lkRoomRef.current.localParticipant.setMicrophoneEnabled(newMicState);
        }
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = newMicState);
        }
        if (newMicState) {
            if (selfMonitorRef.current) selfMonitorRef.current.play().catch(() => {});
        } else {
            if (selfMonitorRef.current) selfMonitorRef.current.pause();
        }
        updateParticipantState(newMicState, isVideoOn, isHandRaised);
    };

    const toggleVideo = async () => {
        const newVideoState = !isVideoOn;
        setIsVideoOn(newVideoState);
        if (lkRoomRef.current) {
            await lkRoomRef.current.localParticipant.setCameraEnabled(newVideoState);
            setTimeout(() => {
                const room = lkRoomRef.current;
                if (!room) return;
                const videoTrack = room.localParticipant.videoTrackPublications.values().next().value?.track?.mediaStreamTrack;
                const localStream = localStreamRef.current || new MediaStream();
                localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
                if (newVideoState && videoTrack) {
                    localStream.addTrack(videoTrack);
                }
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = null;
                    localVideoRef.current.srcObject = localStream;
                }
            }, 200);
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
            return next;
        });

        if (participantWsRef.current && participantWsRef.current.readyState === WebSocket.OPEN) {
            participantWsRef.current.send(JSON.stringify({
                type: "hand_raise",
                user_id: userId,
                user_name: displayName,
                is_raised: newHand
            }));
        }

        updateParticipantState(isMicOn, isVideoOn, newHand);
    };

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
            {/* ✅ Self-monitor: hidden, plays back YOUR OWN mic. Silent while mic is off
                because toggleMic disables the underlying audio track. */}
            <audio ref={selfMonitorRef} autoPlay playsInline style={{ display: "none" }} />

            {/* ✋ HAND RAISE GHOST NOTIFICATIONS */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col-reverse items-center gap-3 pointer-events-none">
                {handRaiseNotifications.map((notif) => (
                    <div
                        key={notif.id}
                        className="flex items-center gap-3 bg-white/95 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.18)] rounded-2xl px-5 py-3"
                        style={{ animation: "handRaiseIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}
                    >
                        {notif.isPresence ? (
                            <>
                                <span className="text-2xl">{notif.presenceType === "joined" ? "👋" : "🚪"}</span>
                                <div>
                                    <p className="text-sm font-bold text-slate-800 leading-tight">
                                        {notif.presenceType === "joined"
                                            ? `${notif.name} joined the meeting`
                                            : `${notif.name} left the meeting`}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        {notif.presenceType === "joined" ? "Welcome!" : "See you later"}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                <span className="text-2xl animate-hand-wave">✋</span>
                                <div>
                                    <p className="text-sm font-bold text-slate-800 leading-tight">
                                        {notif.name === "You" ? "You raised your hand" : `${notif.name} raised their hand`}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">Everyone can see this</p>
                                </div>
                            </>
                        )}
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
                    participantName={displayName}
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
                    handRaiseMembers={handRaiseMembers}
                    liveParticipants={liveParticipants}
                    setShowParticipantsDirect={setShowParticipantsGrid}
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