import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { microserviceApi } from "../../services/api.js";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Room, RoomEvent, Track } from "livekit-client";
import { startScreenShare, stopScreenShare } from "../../api/meeting.js";

const apiBaseUrl = import.meta.env.VITE_MICROSERVICE_URL || "http://localhost:8000";
// Derive WebSocket base URL from the current browser host so it works everywhere:
// localhost dev, ngrok tunnels, LAN IPs — no env var needed.
const wsBaseUrl = (() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
})();

// Subcomponents
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import VideoStage from "./VideoStage.jsx";
import Sidebar from "./Sidebar.jsx";
import ScreenShareModule from "./ScreenShareModule.jsx";
import AddParticipantModal from "./AddParticipantModal.jsx";

const Meeting = () => {
    const [showHandRaise, setShowHandRaise] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
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
    const { company, letter, api_key, meeting_id } = useParams();
    const meetingId = meeting_id || "b40842cc-954a-4bc1-a9da-9036a03e7657";
    const [searchParams] = useSearchParams();

    // Load real logged in user state
    const loggedInEmail = localStorage.getItem("email");
    const loggedInName = localStorage.getItem("name") || localStorage.getItem("username");

    const [userId, setUserId] = useState(loggedInEmail || (() => {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
            (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
        );
    })());

    const [participantName, setParticipantName] = useState(loggedInName || searchParams.get("name") || "Guest");
    const displayName = participantName;
    const [userRole, setUserRole] = useState(searchParams.get("role") || "participant");
    const [meetingTitle, setMeetingTitle] = useState("Huddle");

    useEffect(() => {
        const fetchMeetingDetails = async () => {
            try {
                let response;
                if (company && api_key) {
                    response = await microserviceApi.get(
                        `/api/meeting/validate/${company}/${api_key}/${meetingId}/`
                    );
                } else {
                    response = await microserviceApi.get(
                        `/api/meeting/validate-lobby/${meetingId}/`
                    );
                }
                if (response.data && response.data.title) {
                    setMeetingTitle(response.data.title);
                }
            } catch (err) {
                console.error("Failed to fetch meeting details:", err);
            }
        };
        fetchMeetingDetails();
    }, [company, api_key, meetingId]);


    const meetingLink = meetingId;
    const API_URL = `${apiBaseUrl}/api/meetings`;

    const [livekitToken, setLivekitToken] = useState("");
    const [livekitUrl, setLivekitUrl] = useState("");
    const [isTokenLoaded, setIsTokenLoaded] = useState(false);

    const initialUserIdRef = useRef(userId);
    const initialParticipantNameRef = useRef(participantName);
    const initialUserRoleRef = useRef(userRole);

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const tokenResponse = await microserviceApi.post(`/api/meetings/token/`, {
                    meeting_id: meetingId,
                    user_id: initialUserIdRef.current,
                    name: initialParticipantNameRef.current,
                    role: initialUserRoleRef.current
                });
                if (tokenResponse.data) {
                    setLivekitToken(tokenResponse.data.token || "");
                    setLivekitUrl(tokenResponse.data.url || "");
                    const returnedRole = tokenResponse.data.role;
                    if (returnedRole) {
                        setUserRole(returnedRole);
                    }
                    if (tokenResponse.data.identity) {
                        setUserId(tokenResponse.data.identity);
                    }
                    if (tokenResponse.data.name) {
                        setParticipantName(tokenResponse.data.name);
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch LiveKit token from backend:", e);
            } finally {
                setIsTokenLoaded(true);
            }
        };
        fetchToken();
    }, [meetingId]);

    useEffect(() => {
        setRoomParticipants(prev => {
            const selfExists = prev.some(p => p.isSelf);
            if (selfExists) {
                return prev.map(p => p.isSelf ? { ...p, userId, name: displayName } : p);
            }
            return [{ userId, name: displayName, isSelf: true }, ...prev];
        });
    }, [userId, displayName]);

    // Camera/Mic and LiveKit refs
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const lkRoomRef = useRef(null);
    const selfMonitorRef = useRef(null);

    const [remoteStreams, setRemoteStreams] = useState([]);
    const [roomPeers, setRoomPeers] = useState({});
    const [liveParticipants, setLiveParticipants] = useState([]);



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
        if (!isTokenLoaded) return;

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

                if (!active) return;

                if (livekitUrl && livekitToken) {
                    try {
                        // 2. Connect to LiveKit SFU Server
                        await room.connect(livekitUrl, livekitToken);
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
                            if (track.source === Track.Source.ScreenShare) {
                                const stream = new MediaStream([track.mediaStreamTrack]);
                                setScreenStream(stream);
                                setIsAnotherUserSharing(true);
                                const presenterName = participant.name || participant.identity;
                                setScreenSharer({
                                    user_id: participant.identity,
                                    name: presenterName
                                });
                                setSharerLabel(presenterName);
                            } else {
                                updateRemoteParticipantStream(participant);
                                syncMicState(publication, participant);
                            }
                        });
                        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                            if (track.source === Track.Source.ScreenShare) {
                                setScreenStream(null);
                                setIsAnotherUserSharing(false);
                                setScreenSharer(null);
                                setSharerLabel("");
                            } else {
                                updateRemoteParticipantStream(participant);
                            }
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
                        return; // Successfully connected to LiveKit!
                    } catch (lkErr) {
                        console.error("LiveKit connection attempt failed:", lkErr);
                        toast.error("Failed to connect to LiveKit SFU server.");
                    }
                } else {
                    toast.error("No LiveKit URL or token provided.");
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
    }, [isTokenLoaded, livekitToken, livekitUrl]);

    // ── Participant WebSocket ──
    useEffect(() => {
        if (!meetingId || !isTokenLoaded) return;

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
                    const data = msg;

                    if (data.event === "moderation") {
                        if (data.action === "kick" && data.target_identity === userId) {
                            toast.error("You have been kicked from the meeting by the host.");
                            setTimeout(() => {
                                navigate("/thank-you", {
                                    state: {
                                        company,
                                        letter,
                                        api_key,
                                        meetingId: meetingId,
                                        role: userRole,
                                        name: participantName
                                    }
                                });
                            }, 1500);
                        } else if (data.action === "end_meeting") {
                            toast.error("The meeting has been ended by the host.");
                            setTimeout(() => {
                                navigate("/thank-you", {
                                    state: {
                                        company,
                                        letter,
                                        api_key,
                                        meetingId: meetingId,
                                        role: userRole,
                                        name: participantName
                                    }
                                });
                            }, 1500);
                        }
                        return;
                    }

                    if (
                        data.type === "hand_count_init" ||
                        data.type === "hand_count_update"
                    ) {
                        setLiveHandRaiseCount(data.count || 0);
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
    },[meetingId, participantName, userId, isTokenLoaded]);

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
        if (lkRoomRef.current && lkRoomRef.current.state === "connected") {
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
        if (lkRoomRef.current && lkRoomRef.current.state === "connected") {
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

    const handleKickParticipant = async (targetUserId, targetName) => {
        try {
            await microserviceApi.post(`/api/meetings/moderate/`, {
                meeting_id: meetingId,
                action: "kick",
                target_identity: targetUserId
            });
            toast.success(`Kicked ${targetName} successfully.`);
        } catch (error) {
            console.error("Failed to kick participant:", error);
            toast.error("Failed to kick participant.");
        }
    };

    const handleEndMeeting = async () => {
        try {
            await microserviceApi.post(`/api/meetings/moderate/`, {
                meeting_id: meetingId,
                action: "end_meeting"
            });
            toast.success("Meeting ended successfully.");
            navigate("/thank-you", {
                state: {
                    company,
                    letter,
                    api_key,
                    meetingId: meetingId,
                    role: userRole,
                    name: participantName
                }
            });
        } catch (error) {
            console.error("Failed to end meeting:", error);
            toast.error("Failed to end meeting.");
        }
    };

    const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
    const [isAnotherUserSharing, setIsAnotherUserSharing] = useState(false);
    const [sharerLabel, setSharerLabel] = useState("");
    const [screenStream, setScreenStream] = useState(null);
    const [screenSharer, setScreenSharer] = useState(null);
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

    const handleScreenShare = async () => {
        try {
            if (isAnotherUserSharing) {
                showScreenShareNotice(`${sharerLabel} is already sharing the screen. Only one participant can share at a time.`);
                return;
            }
            const room = lkRoomRef.current;
            if (room && room.state === "connected") {
                const trackPub = await room.localParticipant.setScreenShareEnabled(true);
                const track = trackPub.track;
                if (track && track.mediaStreamTrack) {
                    const stream = new MediaStream([track.mediaStreamTrack]);
                    setScreenStream(stream);
                    setIsLocalScreenSharing(true);
                    setScreenSharer({ user_id: userId, name: displayName });
                    setSharerLabel(displayName);

                    track.mediaStreamTrack.onended = () => {
                        stopSharing();
                    };

                    try {
                        await startScreenShare(meetingId, userId);
                    } catch (err) {
                        console.warn("Failed to notify backend of screen share start:", err);
                    }
                }
            }
        } catch (err) {
            console.error("Failed to start screen share:", err);
        }
    };

    const stopSharing = async () => {
        try {
            const room = lkRoomRef.current;
            if (room && room.state === "connected") {
                await room.localParticipant.setScreenShareEnabled(false);
            }
        } catch (err) {
            console.warn("Failed to stop screen share in LiveKit:", err);
        }
        setScreenStream(null);
        setIsLocalScreenSharing(false);
        setScreenSharer(null);
        setSharerLabel("");
        try {
            await stopScreenShare(meetingId, userId);
        } catch (err) {
            console.warn("Failed to notify backend of screen share stop:", err);
        }
    };

    const handleShareClick = () => {
        if (isAnotherUserSharing) {
            showScreenShareNotice(
                `${sharerLabel} is already sharing the screen. Only one participant can share at a time.`
            );
            return;
        }
        if (isLocalScreenSharing) {
            stopSharing();
        } else {
            handleScreenShare();
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
                meetingTitle={meetingTitle}
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
                    isMicOn={isMicOn}
                    isLocalScreenSharing={isLocalScreenSharing}
                    isAnotherUserSharing={isAnotherUserSharing}
                    screenSharer={screenSharer}
                    screenStream={screenStream}
                    stopSharing={stopSharing}
                    liveParticipants={liveParticipants}
                />
            </main>

            <Footer
                meetingId={meetingId}
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
                onAddParticipantsClick={() => setIsAddParticipantOpen(true)}
                userRole={userRole}
                handleKickParticipant={handleKickParticipant}
                handleEndMeeting={handleEndMeeting}
                liveParticipants={liveParticipants}
            />

            <AddParticipantModal
                open={isAddParticipantOpen}
                setOpen={setIsAddParticipantOpen}
                meetingId={meetingId}
            />
        </div>
    );
};

export default Meeting;