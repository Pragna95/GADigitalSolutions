import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../services/api.js";
import { Room, RoomEvent, Track, ConnectionState, ConnectionQuality } from "livekit-client";
import {
    Mic,
    MicOff,
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
    Volume2,
    VolumeX,
    Shield,
    Users,
    Hand,
    Wifi,
    WifiOff,
    AlertCircle
} from "lucide-react";

const Meeting = () => {
    // UI Layout state
    const [showHandRaise, setShowHandRaise] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [showParticipantsGrid, setShowParticipantsGrid] = useState(false);
    const [showMenuPage, setShowMenuPage] = useState(false);
    const [activeMenu, setActiveMenu] = useState("assistance");
    const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordingStopped, setRecordingStopped] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // LiveKit & Media states
    const [isMicOn, setIsMicOn] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [canLocalPublish, setCanLocalPublish] = useState(false);
    const [roomConnectionState, setRoomConnectionState] = useState(ConnectionState.Disconnected);
    const [speakers, setSpeakers] = useState([]);
    const [listeners, setListeners] = useState([]);
    const [activeSpeakers, setActiveSpeakers] = useState([]);
    const [audioLevels, setAudioLevels] = useState({});
    
    // Routing & Parameters
    const navigate = useNavigate();
    const { meeting_id } = useParams();
    const meetingId = meeting_id || "meeting_001";
    const [searchParams] = useSearchParams();
    const participantName = searchParams.get("name") || "Guest User";
    const isHost = searchParams.get("role") === "host";

    const localPeerId = useMemo(() => `peer-${Math.random().toString(36).slice(2, 10)}`, []);
    const API_URL = "http://127.0.0.1:8000/api/meetings";

    // Refs
    const roomRef = useRef(null);
    const wsRef = useRef(null); // preserved signature matching from original

    // Chat and Recording variables
    const [message, setMessage] = useState("");
    const [chatMessages, setChatMessages] = useState([
        { sender: "Rahul", text: "Welcome everyone! Mute your mics if you are not presenting." },
        { sender: "Anika", text: "I'll raise hand when I have a question." },
    ]);

    const getInitials = (nameStr) => {
        if (!nameStr) return "GU";
        const parts = nameStr.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return parts[0].substring(0, 2).toUpperCase();
    };

    // LiveKit connection and events setup
    useEffect(() => {
        let isCancelled = false;
        
        const connectToLiveKit = async () => {
            try {
                const apiKey = localStorage.getItem("api_key") || "sk_live_1234567890abcdef1234567890abcdef3bb8";
                
                // 1. Fetch the LiveKit Token from Django backend
                const tokenResponse = await axios.post(`${API_URL}/token/`, {
                    meeting_id: meetingId,
                    user_id: localPeerId,
                    name: participantName,
                    role: isHost ? "host" : "listener"
                }, {
                    headers: { "X-API-Key": apiKey }
                });

                if (isCancelled) return;

                const { token, url, role } = tokenResponse.data;

                // 2. Initialize LiveKit Room
                const room = new Room({
                    autoSubscribe: true,
                    audioCaptureDefaults: {
                        autoGainControl: true,
                        echoCancellation: true,
                        noiseSuppression: true,
                    },
                    publishDefaults: {
                        audioPreset: {
                            maxBitrate: 48000 // High-quality voice using Opus
                        }
                    }
                });

                roomRef.current = room;

                const updateParticipants = () => {
                    if (!roomRef.current) return;
                    const allParticipants = [
                        roomRef.current.localParticipant,
                        ...Array.from(roomRef.current.participants.values())
                    ];

                    const currentSpeakers = [];
                    const currentListeners = [];

                    allParticipants.forEach((p) => {
                        if (!p) return;
                        
                        let handRaised = false;
                        let userRole = "listener";
                        try {
                            const meta = JSON.parse(p.metadata || "{}");
                            handRaised = !!meta.handRaised;
                            userRole = meta.role || (p.permissions?.canPublish ? "speaker" : "listener");
                        } catch (e) {
                            // Fallback if metadata is not JSON
                            handRaised = p.metadata === "handRaised";
                        }

                        // A participant is classified as a speaker if they have publish permissions
                        const canPublish = p.permissions?.canPublish ?? false;

                        const participantInfo = {
                            identity: p.identity,
                            name: p.name || p.identity,
                            isLocal: p.isLocal,
                            isMuted: !p.isMicrophoneEnabled,
                            handRaised: handRaised,
                            connectionQuality: p.connectionQuality,
                            role: p.isLocal && isHost ? "host" : (canPublish ? "speaker" : "listener"),
                            trackSid: Array.from(p.audioTracks.values())[0]?.trackSid || null,
                            pObj: p
                        };

                        if (canPublish) {
                            currentSpeakers.push(participantInfo);
                        } else {
                            currentListeners.push(participantInfo);
                        }
                    });

                    setSpeakers(currentSpeakers);
                    setListeners(currentListeners);
                };

                // Bind LiveKit events
                room.on(RoomEvent.ParticipantConnected, updateParticipants);
                room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
                room.on(RoomEvent.TrackPublished, updateParticipants);
                room.on(RoomEvent.TrackUnpublished, updateParticipants);
                room.on(RoomEvent.TrackMuted, updateParticipants);
                room.on(RoomEvent.TrackUnmuted, updateParticipants);
                room.on(RoomEvent.ParticipantMetadataChanged, updateParticipants);
                room.on(RoomEvent.ParticipantPermissionsChanged, (prev, p) => {
                    updateParticipants();
                    if (p.isLocal) {
                        setCanLocalPublish(p.permissions?.canPublish ?? false);
                    }
                });
                room.on(RoomEvent.LocalTrackPublished, updateParticipants);
                room.on(RoomEvent.LocalTrackUnpublished, updateParticipants);
                
                room.on(RoomEvent.ConnectionStateChanged, (state) => {
                    setRoomConnectionState(state);
                });

                room.on(RoomEvent.ActiveSpeakersChanged, (speakersList) => {
                    setActiveSpeakers(speakersList.map(s => s.identity));
                });

                room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                    if (track.kind === Track.Kind.Audio) {
                        const el = track.attach();
                        document.body.appendChild(el);
                        publication.attachedElement = el;
                    }
                });

                room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                    if (publication.attachedElement) {
                        publication.attachedElement.remove();
                        track.detach(publication.attachedElement);
                    }
                });

                // 3. Connect to the LiveKit server
                await room.connect(url, token);

                if (isCancelled) {
                    room.disconnect();
                    return;
                }

                // 4. Initial state sync
                const localCanPublish = room.localParticipant.permissions.canPublish ?? false;
                setCanLocalPublish(localCanPublish);
                
                // Mute mic initially
                setIsMicOn(false);
                await room.localParticipant.setMicrophoneEnabled(false);
                
                // Sync metadata
                await room.localParticipant.setMetadata(JSON.stringify({ handRaised: false, role: isHost ? "host" : "listener" }));
                
                updateParticipants();

            } catch (err) {
                console.error("Failed to connect to LiveKit SFU:", err);
            }
        };

        connectToLiveKit();

        return () => {
            isCancelled = true;
            if (roomRef.current) {
                roomRef.current.disconnect();
                roomRef.current = null;
            }
        };
    }, [meetingId, localPeerId, participantName, isHost]);

    // Volume level polling
    useEffect(() => {
        const interval = setInterval(() => {
            if (!roomRef.current) return;
            const levels = {};
            
            // Local participant level
            if (roomRef.current.localParticipant) {
                levels[roomRef.current.localParticipant.identity] = roomRef.current.localParticipant.audioLevel;
            }
            // Remote participants level
            roomRef.current.participants.forEach((p) => {
                levels[p.identity] = p.audioLevel;
            });
            setAudioLevels(levels);
        }, 100);

        return () => clearInterval(interval);
    }, []);

    // Recording time tracker
    useEffect(() => {
        let interval;
        if (isRecording) {
            interval = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    // Handle Local Mic Mute/Unmute
    const handleMicToggle = async () => {
        if (!roomRef.current || !canLocalPublish) return;
        try {
            const nextState = !isMicOn;
            await roomRef.current.localParticipant.setMicrophoneEnabled(nextState);
            setIsMicOn(nextState);
        } catch (e) {
            console.error("Failed to toggle mic:", e);
        }
    };

    // Handle Local Hand Raise Toggle
    const handleHandRaiseToggle = async () => {
        if (!roomRef.current) return;
        try {
            const nextHand = !isHandRaised;
            setIsHandRaised(nextHand);
            
            // Set metadata on LiveKit local participant which automatically broadcasts in real-time
            await roomRef.current.localParticipant.setMetadata(JSON.stringify({
                handRaised: nextHand,
                role: isHost ? "host" : (canLocalPublish ? "speaker" : "listener")
            }));
            
            // Sync with backend DB
            const apiKey = localStorage.getItem("api_key");
            const dbUserId = "042c3663-c7bb-4783-b2a5-71b715b342b2"; // fallback static DB mapping
            await axios.post(`${API_URL}/participant/update/`, {
                user_id: dbUserId,
                meeting_id: meetingId,
                mic_on: isMicOn,
                video_on: false,
                hand_raised: nextHand,
            }, {
                headers: { "X-API-Key": apiKey }
            });
        } catch (e) {
            console.error("Failed to toggle hand raise:", e);
        }
    };

    // Moderator Action Handler
    const handleModeratorAction = async (action, targetIdentity, trackSid = null) => {
        if (!isHost) return;
        try {
            const apiKey = localStorage.getItem("api_key") || "sk_live_1234567890abcdef1234567890abcdef3bb8";
            await axios.post(`${API_URL}/moderate/`, {
                meeting_id: meetingId,
                action: action,
                target_identity: targetIdentity,
                track_sid: trackSid
            }, {
                headers: { "X-API-Key": apiKey }
            });
        } catch (err) {
            console.error(`Moderation failed for ${action}:`, err);
        }
    };

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const handleSendMessage = () => {
        if (message.trim() === "") return;
        setChatMessages([
            ...chatMessages,
            { sender: "You", text: message }
        ]);
        setMessage("");
    };

    // Filter list for search queries
    const filteredSpeakers = speakers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredListeners = listeners.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()));

    // Get list of users with raised hands
    const handRaisedList = [...speakers, ...listeners].filter(p => p.handRaised);

    // Dynamic Connection Quality indicator helper
    const renderConnectionQuality = (quality) => {
        switch (quality) {
            case ConnectionQuality.Excellent:
                return <Wifi className="text-emerald-500" size={14} title="Excellent Connection" />;
            case ConnectionQuality.Good:
                return <Wifi className="text-amber-500" size={14} title="Good Connection" />;
            case ConnectionQuality.Poor:
                return <Wifi className="text-red-500" size={14} title="Poor Connection" />;
            default:
                return <WifiOff className="text-slate-400" size={14} title="Unknown Connection" />;
        }
    };

    return (
        <div className="h-screen w-screen bg-[#f4f4f5] flex flex-col overflow-hidden font-sans">
            
            {/* ================= RECONNECTION BANNER ================= */}
            {roomConnectionState === ConnectionState.Reconnecting && (
                <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-semibold flex items-center justify-center gap-2 animate-pulse shrink-0">
                    <AlertCircle size={16} />
                    Network disruption detected. Reconnecting to voice chat...
                </div>
            )}

            {/* ================= HEADER ================= */}
            <header className="h-[78px] bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
                {/* LEFT */}
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-650 text-white flex items-center justify-center shadow-sm">
                        <Volume2 size={22} fill="white" />
                    </div>

                    <div className="leading-tight">
                        <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2">
                            Huddle Voice Stage
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                SFU Active
                            </span>
                        </h2>
                        <p className="text-[12px] text-slate-400 mt-1">
                            Live Audio Stream Room ({speakers.length + listeners.length} online)
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
                            fill={isRecording ? "white" : "#D14343"}
                            color={isRecording ? "white" : "#D14343"}
                            className={isRecording ? "animate-pulse" : ""}
                        />
                        {isRecording
                            ? `REC ${formatTime(recordingTime)}`
                            : recordingStopped
                              ? "Stopping..."
                              : "Record Room"}
                    </button>
                </div>

                {/* RIGHT */}
                <button
                    onClick={() => navigate("/thank-you")}
                    className="bg-[#D14343] hover:bg-[#b93232] hover:shadow-[0_4px_12px_rgba(209,67,67,0.3)] hover:-translate-y-0.5 active:translate-y-0 text-white px-4 h-[40px] rounded-lg flex items-center gap-2 text-[15px] font-bold shadow-sm transition-all duration-300 cursor-pointer"
                >
                    Leave Stage
                    <PhoneOff size={16} />
                </button>
            </header>

            {/* ================= BODY ================= */}
            <main className="flex-1 p-4 flex gap-4 min-h-0 overflow-hidden">
                
                {/* ================= MAIN SPEAKER AREA ================= */}
                <div
                    className={`relative rounded-[28px] overflow-hidden bg-slate-900 border border-slate-850 shadow-[0_12px_40px_rgba(0,0,0,0.25)] h-full flex flex-col p-6 transition-all duration-300 ${
                        showParticipantsGrid
                            ? "w-full"
                            : showHandRaise || showParticipants || showMenuPage
                              ? "w-[80%]"
                              : "w-full"
                    }`}
                >
                    {/* Background Overlay */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950/80 to-slate-950 z-0"></div>

                    {showParticipantsGrid ? (
                        /* ================= LISTENER GRID OVERLAY ================= */
                        <div className="relative z-10 w-full h-full flex flex-col animate-fade-in">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-white text-2xl font-bold tracking-tight">
                                    All Listeners ({listeners.length})
                                </h2>
                                <button
                                    onClick={() => setShowParticipantsGrid(false)}
                                    className="bg-white text-slate-700 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all duration-200 shadow-sm cursor-pointer"
                                >
                                    Back to Room
                                </button>
                            </div>

                            <div className="grid grid-cols-4 gap-5 overflow-y-auto flex-1 pr-1 dark-scroll">
                                {listeners.map((listener, index) => (
                                    <div
                                        key={listener.identity}
                                        className="relative p-4 rounded-[20px] border border-slate-800 bg-slate-950/50 flex flex-col items-center justify-center hover:border-indigo-500 hover:scale-[1.02] transition-all duration-300 group"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-slate-800 text-white flex items-center justify-center text-xl font-bold border border-slate-700 shadow-sm mb-3">
                                            {getInitials(listener.name)}
                                        </div>
                                        <span className="text-white text-sm font-semibold mb-1 truncate max-w-full">
                                            {listener.name}
                                        </span>
                                        <span className="text-xs text-slate-500">Listener</span>

                                        {/* Admin Action for promotion */}
                                        {isHost && (
                                            <button
                                                onClick={() => handleModeratorAction("promote", listener.identity)}
                                                className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                                            >
                                                Invite to Speaker
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* ================= MAIN SPEAKER STAGE ================= */
                        <div className="relative z-10 w-full h-full flex flex-col min-h-0">
                            
                            {/* STAGE HEADER */}
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-white text-xs font-extrabold uppercase tracking-widest text-indigo-400">
                                        The Stage
                                    </h3>
                                    <h2 className="text-white text-xl font-bold tracking-tight mt-1">
                                        Speakers ({speakers.length})
                                    </h2>
                                </div>
                                
                                {/* Overlay counters trigger */}
                                <div className="flex items-center gap-3">
                                    {isHost && handRaisedList.length > 0 && (
                                        <button
                                            onClick={() => {
                                                setShowHandRaise(true);
                                                setShowParticipants(false);
                                                setShowMenuPage(false);
                                            }}
                                            className="bg-amber-400 hover:bg-amber-500 hover:scale-105 active:scale-95 text-black h-[38px] px-4 rounded-[22px] flex items-center gap-1.5 shadow-lg font-bold transition-all duration-200 cursor-pointer animate-bounce"
                                        >
                                            ✋ {handRaisedList.length} Raised Hands
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setShowParticipants(!showParticipants);
                                            setShowHandRaise(false);
                                            setShowMenuPage(false);
                                        }}
                                        className="bg-white/10 hover:bg-white/15 h-[38px] px-4 rounded-[22px] flex items-center justify-center shadow-lg border border-white/5 hover:scale-105 active:scale-95 text-white text-sm font-semibold transition-all duration-200 cursor-pointer"
                                    >
                                        <Users size={15} className="mr-2" />
                                        Audience ({listeners.length})
                                    </button>
                                </div>
                            </div>

                            {/* SPEAKERS AVATAR GRID */}
                            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 align-content-start pr-1 dark-scroll">
                                {filteredSpeakers.map((speaker) => {
                                    const isSpeaking = activeSpeakers.includes(speaker.identity);
                                    const audioLevel = audioLevels[speaker.identity] || 0;
                                    // Scale audioLevel for mic visualizer
                                    const scale = 1 + audioLevel * 0.4;
                                    
                                    return (
                                        <div
                                            key={speaker.identity}
                                            className="relative flex flex-col items-center justify-center p-4 rounded-3xl border border-slate-800/40 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700/50 transition-all duration-300 group"
                                        >
                                            
                                            {/* Glowing speaker ring */}
                                            <div 
                                                style={{ transform: `scale(${isSpeaking ? scale : 1})` }}
                                                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-75 shadow-md ${
                                                    isSpeaking 
                                                        ? "ring-4 ring-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)] bg-slate-950" 
                                                        : "bg-slate-950 border border-slate-800"
                                                }`}
                                            >
                                                {/* Speaker initials / avatar placeholder */}
                                                <div className="w-18 h-18 rounded-full bg-slate-800 text-white flex items-center justify-center text-2xl font-bold">
                                                    {getInitials(speaker.name)}
                                                </div>

                                                {/* Micro audio meter inside ring */}
                                                {isSpeaking && (
                                                    <span className="absolute -bottom-1 bg-indigo-600 p-1 rounded-full text-white animate-pulse">
                                                        <Volume2 size={10} />
                                                    </span>
                                                )}
                                            </div>

                                            {/* Role & Mute Status Badges */}
                                            <div className="mt-4 flex flex-col items-center text-center">
                                                <span className="text-white text-sm font-semibold flex items-center gap-1">
                                                    {speaker.name}
                                                    {speaker.role === "host" && <Shield size={12} className="text-indigo-400" title="Host" />}
                                                </span>
                                                
                                                <span className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                                                    {speaker.isMuted ? (
                                                        <span className="flex items-center text-red-400 gap-0.5">
                                                            <MicOff size={10} /> Muted
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center text-emerald-400 gap-0.5">
                                                            <Mic size={10} /> Speaking
                                                        </span>
                                                    )}
                                                    • {renderConnectionQuality(speaker.connectionQuality)}
                                                </span>
                                            </div>

                                            {/* Raised hand indicator on grid card */}
                                            {speaker.handRaised && (
                                                <span className="absolute top-3 right-3 bg-yellow-400 p-1.5 rounded-full text-black text-xs font-bold shadow-md animate-bounce">
                                                    ✋
                                                </span>
                                            )}

                                            {/* Admin Moderation Actions menu overlay on Hover */}
                                            {isHost && !speaker.isLocal && (
                                                <div className="absolute inset-0 bg-slate-950/90 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2 p-3">
                                                    <p className="text-xs text-white font-bold mb-1 truncate max-w-full">
                                                        Moderate {speaker.name}
                                                    </p>
                                                    
                                                    <button
                                                        onClick={() => handleModeratorAction("demote", speaker.identity)}
                                                        className="w-full bg-amber-600 hover:bg-amber-700 text-white text-[11px] py-1.5 rounded-lg font-bold cursor-pointer"
                                                    >
                                                        Mute & Move to Audience
                                                    </button>
                                                    
                                                    <button
                                                        onClick={() => handleModeratorAction("kick", speaker.identity)}
                                                        className="w-full bg-red-600 hover:bg-red-700 text-white text-[11px] py-1.5 rounded-lg font-bold cursor-pointer"
                                                    >
                                                        Kick Out of Room
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* MAIN AREA FOOTER (Listener Counter Bar) */}
                            <div className="mt-4 border-t border-slate-800/50 pt-4 flex items-center justify-between text-xs text-slate-400">
                                <span>Voice Server Latency: ~24ms</span>
                                <span>Opus Stereo VAD Enabled</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ================= SIDEBAR ================= */}
                {(showHandRaise || showParticipants) &&
                    !showParticipantsGrid &&
                    !showMenuPage && (
                        <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 flex flex-col h-full shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right shrink-0">
                            {/* TOP */}
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-1.5">
                                    {showHandRaise ? (
                                        <>✋ Raised Hands</>
                                    ) : (
                                        <>Audience List</>
                                    )}
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowHandRaise(false);
                                        setShowParticipants(false);
                                    }}
                                    className="w-6 h-6 border border-slate-300 hover:border-slate-500 rounded flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                                >
                                    ×
                                </button>
                            </div>

                            {/* SEARCH BAR */}
                            <div className="relative mb-4">
                                <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search audience..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 rounded-xl py-2 pl-9 pr-3 text-sm outline-none transition-all duration-200"
                                />
                            </div>

                            {/* COUNT */}
                            <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wide">
                                {showHandRaise
                                    ? `${handRaisedList.length} Requesting to Speak`
                                    : `${filteredListeners.length} Listeners`}
                            </p>

                            {/* MEMBERS SCROLLER */}
                            <div className="space-y-3 overflow-y-auto flex-1 dark-scroll">
                                {(showHandRaise ? handRaisedList : filteredListeners).map((member, index) => (
                                    <div
                                        key={member.identity}
                                        className="border border-slate-100 rounded-xl p-3 flex flex-col gap-2 hover:bg-slate-50/85 hover:border-slate-200 hover:shadow-sm transition-all duration-200 group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                                                    {getInitials(member.name)}
                                                </div>
                                                <span className="text-sm font-bold text-slate-700 truncate max-w-[100px]">
                                                    {member.name}
                                                </span>
                                            </div>
                                            
                                            {/* Connection Quality */}
                                            {renderConnectionQuality(member.connectionQuality)}
                                        </div>

                                        {/* Actions for Admin in Sidebar */}
                                        {isHost && (
                                            <div className="flex items-center gap-1.5 mt-1 border-t border-slate-100/50 pt-2">
                                                {showHandRaise ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleModeratorAction("promote", member.identity)}
                                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] py-1 rounded-md font-bold cursor-pointer transition-colors"
                                                        >
                                                            Approve / Promote
                                                        </button>
                                                        <button
                                                            onClick={() => handleModeratorAction("demote", member.identity)} // demote just resets hand raised
                                                            className="px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] py-1 rounded-md font-bold cursor-pointer"
                                                        >
                                                            Dismiss
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => handleModeratorAction("promote", member.identity)}
                                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] py-1 rounded-md font-bold cursor-pointer"
                                                        >
                                                            Promote to Speaker
                                                        </button>
                                                        <button
                                                            onClick={() => handleModeratorAction("kick", member.identity)}
                                                            className="px-2 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] py-1 rounded-md font-bold cursor-pointer"
                                                        >
                                                            Kick
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* VIEW ALL BUTTON */}
                            {!showHandRaise && (
                                <button
                                    onClick={() => setShowParticipantsGrid(true)}
                                    className="mt-4 bg-[#0f172a] hover:bg-slate-800 active:scale-[0.98] text-white py-3 rounded-2xl text-sm font-bold shadow-sm transition-all duration-200 cursor-pointer"
                                >
                                    View Grid List
                                </button>
                            )}
                        </div>
                    )}

                {/* ================= MENU PAGE (CHAT, NOTES, AI) ================= */}
                {showMenuPage && (
                    <div className="w-[20%] bg-white rounded-[24px] border border-slate-200/80 p-4 h-full flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.02)] animate-slide-in-right shrink-0">
                        {/* HEADER */}
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                            <h2 className="text-[18px] font-bold text-slate-800">
                                Huddle Tools
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
                                className={`flex-1 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                                    activeMenu === "chat"
                                        ? "bg-indigo-650 text-white shadow-md"
                                        : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                Chat
                            </button>
                            <button
                                onClick={() => setActiveMenu("notes")}
                                className={`flex-1 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                                    activeMenu === "notes"
                                        ? "bg-indigo-650 text-white shadow-md"
                                        : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                Notes
                            </button>
                            <button
                                onClick={() => setActiveMenu("assistance")}
                                className={`flex-1 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                                    activeMenu === "assistance"
                                        ? "bg-indigo-650 text-white shadow-md"
                                        : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                Captions
                            </button>
                        </div>

                        {/* CONTENT VIEWS */}
                        <div className="mt-5 flex-1 overflow-hidden flex flex-col">
                            {/* CHAT */}
                            {activeMenu === "chat" && (
                                <div className="flex flex-col h-full animate-fade-in">
                                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 dark-scroll">
                                        {chatMessages.map((msg, index) => (
                                            <div
                                                key={index}
                                                className={`flex ${
                                                    msg.sender === "You" ? "justify-end" : "justify-start"
                                                }`}
                                            >
                                                <div
                                                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm ${
                                                        msg.sender === "You"
                                                            ? "bg-indigo-650 text-white rounded-tr-none"
                                                            : "bg-slate-100 text-slate-700 rounded-tl-none"
                                                    }`}
                                                >
                                                    <p className="text-[10px] font-bold mb-0.5 opacity-80">
                                                        {msg.sender}
                                                    </p>
                                                    <p className="text-xs leading-relaxed break-words">
                                                        {msg.text}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* INPUT BOX */}
                                    <div className="mt-4 flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder="Type message..."
                                            className="flex-1 border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 rounded-2xl px-4 py-3 text-xs outline-none transition-all duration-200"
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            className="w-10 h-10 rounded-2xl bg-indigo-605 hover:bg-indigo-700 text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-md"
                                        >
                                            <SendHorizontal size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* NOTES */}
                            {activeMenu === "notes" && (
                                <textarea
                                    placeholder="Type your notes here..."
                                    className="w-full h-full border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 rounded-2xl p-4 outline-none resize-none transition-all animate-fade-in"
                                ></textarea>
                            )}

                            {/* TRANSCRIPTION / CAPTIONS */}
                            {activeMenu === "assistance" && (
                                <div className="flex flex-col gap-4 animate-fade-in h-full overflow-hidden">
                                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm shrink-0">
                                        <div>
                                            <p className="font-bold text-slate-700 text-sm">
                                                Live Captions
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                Autorecord transcripts
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setTranscriptionEnabled(!transcriptionEnabled)}
                                            className={`w-12 h-6 rounded-full flex items-center px-0.5 transition-colors duration-300 cursor-pointer ${
                                                transcriptionEnabled ? "bg-indigo-650" : "bg-slate-350"
                                            }`}
                                        >
                                            <div
                                                className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                                                    transcriptionEnabled ? "translate-x-6" : ""
                                                }`}
                                            ></div>
                                        </button>
                                    </div>

                                    {transcriptionEnabled && (
                                        <div className="space-y-3 overflow-y-auto flex-1 pr-1 dark-scroll">
                                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                <p className="text-[10px] font-bold text-indigo-700 mb-1 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                                                    LIVE
                                                </p>
                                                <p className="text-xs text-slate-700 leading-relaxed">
                                                    <span className="font-semibold">Rahul:</span> Let's kick off the audio session and discuss bandwidth benchmarks.
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                <p className="text-[10px] font-bold text-indigo-700 mb-1 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                                                    LIVE
                                                </p>
                                                <p className="text-xs text-slate-700 leading-relaxed">
                                                    <span className="font-semibold">Anika:</span> LiveKit handles Opus 48kbps selectively for all 500+ listeners.
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

            {/* ================= FOOTER CONTROL BAR ================= */}
            <footer className="h-[95px] bg-[#f8fafc] border-t border-slate-100 flex items-center justify-between px-6 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.015)]">
                {/* LEFT */}
                <div className="flex items-center gap-3">
                    <span className="text-[11px] uppercase tracking-wide font-bold text-slate-400">
                        ROOM CODE
                    </span>
                    <div 
                        onClick={() => {
                            navigator.clipboard.writeText(meetingId);
                        }}
                        className="bg-slate-650 hover:bg-slate-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-sm transition-all duration-200 cursor-pointer active:scale-95 hover:shadow-md"
                    >
                        {meetingId.substring(0, 10)}...
                        <Copy size={14} />
                    </div>
                </div>

                {/* CENTER CONTROL BUTTONS */}
                <div className="bg-white px-5 py-3 rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.05)] flex items-center gap-3 border border-slate-100 animate-slide-up">
                    
                    {/* MIC BUTTON */}
                    <div className="flex items-center bg-slate-50 hover:bg-slate-100/60 rounded-xl px-1 transition-colors duration-200">
                        <button
                            disabled={!canLocalPublish}
                            onClick={handleMicToggle}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                                !canLocalPublish
                                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                    : isMicOn
                                      ? "text-slate-600 hover:bg-slate-100"
                                      : "bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-red-650"
                            }`}
                            title={!canLocalPublish ? "You are a listener. Request to speak." : isMicOn ? "Mute Mic" : "Unmute Mic"}
                        >
                            {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                        </button>
                        <ChevronDown size={15} className="text-slate-400 mr-2" />
                    </div>

                    {/* MOCK VIDEO CONTROL (DISABLED FOR VOICE-ONLY) */}
                    <div className="flex items-center bg-slate-100 rounded-xl px-1 cursor-not-allowed opacity-50" title="Video disabled in audio-only rooms">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400">
                            <VolumeX size={18} />
                        </div>
                    </div>

                    {/* SHARE (DISABLED FOR VOICE-ONLY) */}
                    <button disabled className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-300 cursor-not-allowed border border-transparent" title="Screen sharing disabled">
                        <Share size={18} />
                    </button>

                    <div className="w-px h-7 bg-slate-200"></div>

                    {/* RAISE HAND BUTTON */}
                    <button
                        onClick={handleHandRaiseToggle}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer ${
                            isHandRaised
                                ? "bg-yellow-400 text-black hover:bg-yellow-500 shadow-[0_2px_8px_rgba(250,204,21,0.3)]"
                                : "bg-white hover:bg-slate-100 border border-slate-100 hover:shadow-sm"
                        }`}
                        title={isHandRaised ? "Lower Hand" : "Raise Hand to Speak"}
                    >
                        <span className="text-[20px]"><Hand size={18} className={isHandRaised ? "text-slate-900" : "text-slate-600"} /></span>
                    </button>

                    <button className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:scale-110 active:scale-95 transition-all duration-205 cursor-pointer hover:shadow-sm border border-transparent">
                        <UserPlus size={18} />
                    </button>

                    <button className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:scale-110 active:scale-95 transition-all duration-205 cursor-pointer hover:shadow-sm border border-transparent">
                        <MoreVertical size={18} />
                    </button>
                </div>

                {/* RIGHT SIDE TOGGLES */}
                <div className="flex items-center gap-3">
                    <button className="w-11 h-11 rounded-xl border border-slate-250 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all shadow-sm cursor-pointer hover:shadow-md">
                        <FilePenLine size={18} />
                    </button>

                    {/* TOOLS TOGGLER */}
                    <button
                        onClick={() => {
                            setShowMenuPage(!showMenuPage);
                            setShowParticipants(false);
                            setShowHandRaise(false);
                        }}
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all shadow-sm cursor-pointer hover:shadow-md ${
                            showMenuPage 
                                ? "bg-indigo-650 border-indigo-650 text-white" 
                                : "border-slate-250 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        <LayoutGrid size={18} />
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default Meeting;
