import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

// Subcomponents
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import VideoStage from "./VideoStage.jsx";
import Sidebar from "./Sidebar.jsx";
import ScreenShareModule from "./ScreenShareModule.jsx";

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
    }, [meetingId]);

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

    const toggleHandRaise = () => {
        const newHand = !isHandRaised;
        setIsHandRaised(newHand);
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
