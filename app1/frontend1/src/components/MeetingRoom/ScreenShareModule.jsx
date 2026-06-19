import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { createSocket } from "../../services/socket";
import { createPeerConnection } from "../../services/webrtc";
import { startScreenShare, stopScreenShare, getScreenSharer } from "../../api/meeting";
import { Monitor, X, MicOff } from "lucide-react";

// --- Sub-components for encapsulation ---

export const InitialsAvatar = ({ name, isSelf = false }) => (
    <div
        className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-base shrink-0 border-2 ${
            isSelf ? "bg-indigo-700 border-indigo-400" : "bg-slate-600 border-slate-400"
        }`}
    >
        {(name || "??").slice(0, 2).toUpperCase()}
    </div>
);

export const ParticipantTile = ({ name, isSelf = false, isMuted = false }) => (
    <div className="relative w-[150px] h-[100px] rounded-2xl overflow-hidden bg-[#1e1f26] border border-white/10 shadow-xl flex items-center justify-center shrink-0">
        <div className="flex flex-col items-center gap-2">
            <InitialsAvatar name={name} isSelf={isSelf} />
            <p className="text-white text-xs font-semibold truncate max-w-[130px] px-2 text-center">
                {isSelf ? `${name} (You)` : name}
            </p>
        </div>
        {isMuted && (
            <div className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1">
                <MicOff size={11} className="text-red-400" />
            </div>
        )}
    </div>
);

// --- Main Screen Share Engine & UI Module ---

export const ScreenShareModule = ({
    userId,
    displayName,
    meetingId,
    meetingLink,
    roomParticipants,
    setRoomParticipants,
    roomParticipantsRef,
    isMicOn,
}) => {
    const socketRef = useRef(null);
    const socketQueueRef = useRef([]);
    const socketReadyRef = useRef(false);

    const peersRef = useRef({});
    const pendingCandidatesRef = useRef({});
    const makingOfferRef = useRef({});

    const videoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const screenStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const screenShareNoticeTimerRef = useRef(null);

    const [screenSharer, setScreenSharer] = useState(null);
    const [screenStream, setScreenStream] = useState(null);
    const [screenShareNotice, setScreenShareNotice] = useState("");
    const [screenViewers, setScreenViewers] = useState([]);

    // Logic States
    const isLocalScreenSharing = !!screenStream && String(screenSharer?.user_id) === String(userId);
    const isRemoteScreenSharing = !!screenSharer && String(screenSharer.user_id) !== String(userId);
    const isScreenSharing = isLocalScreenSharing || isRemoteScreenSharing;
    const isAnotherUserSharing = isRemoteScreenSharing;

    const getParticipantNameById = (id) => {
        if (!id) return "Someone";
        const list = roomParticipantsRef.current || [];
        return list.find((p) => String(p.userId) === String(id))?.name || "Someone";
    };

    const getSharerLabel = () => {
        if (!screenSharer) return "";
        return screenSharer.name || getParticipantNameById(screenSharer.user_id) || "Someone";
    };

    const showScreenShareNotice = (text) => {
        setScreenShareNotice(text);
        if (screenShareNoticeTimerRef.current) clearTimeout(screenShareNoticeTimerRef.current);
        screenShareNoticeTimerRef.current = setTimeout(() => setScreenShareNotice(""), 3000);
    };

    const flushSocketQueue = (socket) => {
        while (socketQueueRef.current.length > 0) {
            const payload = socketQueueRef.current.shift();
            try {
                socket.send(payload);
            } catch (err) {
                console.log("Queue flush error:", err);
            }
        }
    };

    const safeSend = (data) => {
        const payload = JSON.stringify(data);
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            socketQueueRef.current.push(payload);
            return;
        }
        socket.send(payload);
    };

    const syncRoomParticipants = (incomingList = []) => {
        const cleaned = incomingList.filter(Boolean).filter((p) => String(p.userId) !== String(userId));
        setRoomParticipants([{ userId, name: displayName, isSelf: true }, ...cleaned]);

        if (screenSharer) {
            // FIXED: previously this only ADDED new ids from `cleaned` into
            // screenViewers and never removed ids that were no longer present.
            // That meant anyone who left while a screen share was active stayed
            // stuck in the viewer tiles bar forever. `cleaned` is the
            // authoritative current participant list from the server, so we now
            // rebuild screenViewers strictly from it (still preserving any extra
            // metadata already known about each viewer).
            setScreenViewers((prev) => {
                const prevByid = new Map(prev.map((v) => [String(v.userId), v]));
                return cleaned.map((p) => {
                    const existing = prevByid.get(String(p.userId));
                    return existing || { userId: p.userId, name: p.name || p.userId };
                });
            });
        }
    };

    const addOrUpdateRoomParticipant = (participant) => {
        if (!participant?.userId) return;
        setRoomParticipants((prev) => {
            const without = prev.filter((p) => String(p.userId) !== String(participant.userId) && !p.isSelf);
            return [{ userId, name: displayName, isSelf: true }, ...without, { ...participant, isSelf: false }];
        });
        if (screenSharer) {
            setScreenViewers((prev) => {
                const exists = prev.find((v) => String(v.userId) === String(participant.userId));
                if (exists) return prev;
                return [...prev, { userId: participant.userId, name: participant.name || participant.userId }];
            });
        }
    };

    const removeRoomParticipant = (participantId) => {
        setRoomParticipants((prev) => prev.filter((p) => String(p.userId) !== String(participantId) || p.isSelf));
        setScreenViewers((prev) => prev.filter((v) => String(v.userId) !== String(participantId)));
    };

    const closePeer = (remoteUserId) => {
        const peer = peersRef.current[remoteUserId];
        if (!peer) return;
        try {
            peer.close();
        } catch (err) {
            console.log(err);
        }
        delete peersRef.current[remoteUserId];
        delete pendingCandidatesRef.current[remoteUserId];
        delete makingOfferRef.current[remoteUserId];
    };

    const renegotiatePeer = async (peer, remoteUserId) => {
        if (!peer || !remoteUserId || peer.signalingState !== "stable" || makingOfferRef.current[remoteUserId]) return;
        try {
            makingOfferRef.current[remoteUserId] = true;
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            safeSend({ type: "offer", offer: peer.localDescription, userId, to: remoteUserId });
        } catch (err) {
            console.log("Screen share renegotiation error:", err);
        } finally {
            makingOfferRef.current[remoteUserId] = false;
        }
    };

    const getOrCreatePeer = (remoteUserId) => {
        if (peersRef.current[remoteUserId]) return peersRef.current[remoteUserId];
        pendingCandidatesRef.current[remoteUserId] = [];
        makingOfferRef.current[remoteUserId] = false;

        const peer = createPeerConnection(
            (stream) => {
                if (stream) {
                    remoteStreamRef.current = stream;
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = stream;
                        remoteVideoRef.current.play().catch(() => {});
                    }
                }
            },
            (candidate) => {
                safeSend({ type: "ice-candidate", candidate, userId, to: remoteUserId });
            }
        );

        peer.onnegotiationneeded = async () => {
            if (peer.signalingState !== "stable" || makingOfferRef.current[remoteUserId]) return;
            try {
                makingOfferRef.current[remoteUserId] = true;
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                safeSend({ type: "offer", offer: peer.localDescription, userId, to: remoteUserId });
            } catch (err) {
                console.log("Negotiation error:", err);
            } finally {
                makingOfferRef.current[remoteUserId] = false;
            }
        };

        peersRef.current[remoteUserId] = peer;
        return peer;
    };

    const flushPendingCandidates = async (remoteUserId, peer) => {
        const pending = pendingCandidatesRef.current[remoteUserId] || [];
        pendingCandidatesRef.current[remoteUserId] = [];
        for (const candidate of pending) {
            try {
                await peer.addIceCandidate(candidate);
            } catch (err) {
                console.log("Pending ICE error:", err);
            }
        }
    };

    const attachScreenTrackToPeer = async (peer, stream, remoteUserId) => {
        if (!peer || !stream) return;
        let changed = false;
        for (const track of stream.getTracks()) {
            const sender = peer.getSenders().find((s) => s.track?.kind === track.kind);
            if (sender) {
                if (sender.track?.id !== track.id) {
                    try {
                        await sender.replaceTrack(track);
                        changed = true;
                    } catch (err) {
                        console.log("replaceTrack error:", err);
                    }
                }
            } else {
                try {
                    peer.addTrack(track, stream);
                    changed = true;
                } catch (err) {
                    console.log("addTrack error:", err);
                }
            }
        }
        if (changed && remoteUserId) {
            await renegotiatePeer(peer, remoteUserId);
        }
    };

    const handleOffer = async (data) => {
        const remoteUserId = data.userId;
        const peer = getOrCreatePeer(remoteUserId);
        try {
            if (peer.signalingState !== "stable") {
                try {
                    await peer.setLocalDescription({ type: "rollback" });
                } catch (err) {
                    console.log("Rollback skipped:", err);
                }
            }
            await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
            if (peer.signalingState !== "have-remote-offer") return;
            await flushPendingCandidates(remoteUserId, peer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            safeSend({ type: "answer", answer: peer.localDescription, userId, to: remoteUserId });
        } catch (err) {
            console.log("Offer handling error:", err);
        }
    };

    const handleAnswer = async (data) => {
        const remoteUserId = data.userId;
        const peer = peersRef.current[remoteUserId];
        if (!peer || peer.signalingState !== "have-local-offer") return;
        try {
            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
            await flushPendingCandidates(remoteUserId, peer);
        } catch (err) {
            console.log("Answer handling error:", err);
        }
    };

    const handleIce = async (data) => {
        const remoteUserId = data.userId;
        const peer = peersRef.current[remoteUserId] || getOrCreatePeer(remoteUserId);
        const candidate = new RTCIceCandidate(data.candidate);
        try {
            if (peer.remoteDescription) {
                await peer.addIceCandidate(candidate);
            } else {
                if (!pendingCandidatesRef.current[remoteUserId]) pendingCandidatesRef.current[remoteUserId] = [];
                pendingCandidatesRef.current[remoteUserId].push(candidate);
            }
        } catch (err) {
            console.log("ICE error:", err);
        }
    };

    const handleParticipantJoined = async (participant) => {
        if (!participant?.userId || String(participant.userId) === String(userId)) return;
        addOrUpdateRoomParticipant(participant);

        if (screenStreamRef.current) {
            const peer = getOrCreatePeer(participant.userId);
            await attachScreenTrackToPeer(peer, screenStreamRef.current, participant.userId);
        }
        if (screenSharer && String(screenSharer.user_id) !== String(participant.userId)) {
            setScreenViewers((prev) => {
                const exists = prev.find((v) => String(v.userId) === String(participant.userId));
                if (exists) return prev;
                return [...prev, { userId: participant.userId, name: participant.name || participant.userId }];
            });
        }
    };

    const handleParticipantLeft = (participantId) => {
        if (!participantId) return;
        removeRoomParticipant(participantId);
        closePeer(participantId);
        if (String(screenSharer?.user_id) === String(participantId)) {
            setScreenSharer(null);
            setScreenStream(null);
            setScreenViewers([]);
            remoteStreamRef.current = null;
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
                remoteVideoRef.current.style.display = "block";
            }
        }
    };

    // --- Bridging event listeners to trigger events and sync state changes with parent ---
    useEffect(() => {
        const handleStartRequest = () => {
            handleScreenShare();
        };
        const handleStopRequest = () => {
            stopSharing();
        };
        window.addEventListener("request-start-screen-share", handleStartRequest);
        window.addEventListener("request-stop-screen-share", handleStopRequest);
        return () => {
            window.removeEventListener("request-start-screen-share", handleStartRequest);
            window.removeEventListener("request-stop-screen-share", handleStopRequest);
        };
    }, [isAnotherUserSharing, isLocalScreenSharing, screenSharer, screenStream, userId, displayName]);

    useEffect(() => {
        const event = new CustomEvent("screen-share-state-update", {
            detail: {
                isLocalScreenSharing,
                isAnotherUserSharing,
                sharerLabel: getSharerLabel(),
            }
        });
        window.dispatchEvent(event);
    }, [isLocalScreenSharing, isAnotherUserSharing, screenSharer]);

    // Lifecycles & Handlers
    useEffect(() => {
        if (videoRef.current && screenStream && isLocalScreenSharing) {
            videoRef.current.srcObject = screenStream;
            videoRef.current.play().catch(() => {});
        }
    }, [screenStream, isLocalScreenSharing]);

    // FIXED: This used to run fetchCurrentSharer() once AND THEN set up a
    // setInterval that re-ran it every 2000ms for as long as the component was
    // mounted. Every open tab independently polled this endpoint every 2
    // seconds — that's what was flooding your terminal with continuous GET
    // requests to /current-screen-sharer/. This polling was also redundant:
    // the "screen-share-start" / "screen-share-stop" WebSocket events handled
    // in the socket.onmessage handler below already update `screenSharer` in
    // real time. So we only need ONE fetch on mount (to catch a screen share
    // that was already in progress before this tab joined) — no interval.
    useEffect(() => {
        let alive = true;
        const fetchCurrentSharer = async () => {
            try {
                const res = await getScreenSharer(meetingLink);
                const ss = res?.data?.screen_share || null;
                if (!alive) return;
                if (ss) {
                    const resolvedName = ss.name || getParticipantNameById(ss.user_id) || "Someone";
                    setScreenSharer({ ...ss, name: resolvedName });
                } else {
                    setScreenSharer(null);
                    setScreenViewers([]);
                }
            } catch (err) {
                const status = err?.response?.status;
                if (alive && status !== 400 && status !== 404) console.warn("getScreenSharer failed:", status);
            }
        };

        fetchCurrentSharer(); // one-time check on mount only — no setInterval

        return () => {
            alive = false;
        };
    }, [meetingLink]);

    useEffect(() => {
        let cancelled = false;
        let socket = null;
        const timer = setTimeout(() => {
            if (cancelled) return;
            socket = createSocket(meetingLink);
            socketRef.current = socket;
            socketReadyRef.current = false;

            socket.onopen = () => {
                if (cancelled) {
                    try { socket.close(1000, "cleanup"); } catch (err) { console.log(err); }
                    return;
                }
                socketReadyRef.current = true;
                flushSocketQueue(socket);
                safeSend({ type: "join", userId, name: displayName });
            };

            socket.onerror = (e) => console.log("Socket error", e);
            socket.onclose = () => {
                socketReadyRef.current = false;
                if (socketRef.current === socket) socketRef.current = null;
            };

            socket.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                if (String(data.userId) === String(userId)) return;

                if (data.type === "participants") syncRoomParticipants(data.participants || []);
                else if (data.type === "participant-joined") await handleParticipantJoined(data.participant);
                else if (data.type === "participant-left") handleParticipantLeft(data.userId);
                else if (data.type === "offer") await handleOffer(data);
                else if (data.type === "answer") await handleAnswer(data);
                else if (data.type === "ice-candidate") await handleIce(data);
                else if (data.type === "screen-share-start") {
                    const sharerId = data.screenSharer?.user_id || data.userId;
                    const sharerName = data.screenSharer?.name || getParticipantNameById(sharerId) || "Someone";
                    setScreenSharer({ user_id: sharerId, name: sharerName });

                    if (String(sharerId) !== String(userId)) {
                        setScreenViewers((prev) => {
                            const exists = prev.find((p) => String(p.userId) === String(userId));
                            if (exists) return prev;
                            return [...prev, { userId, name: displayName, isSelf: true }];
                        });
                        setRoomParticipants((currentParticipants) => {
                            setScreenViewers((prev) => {
                                const existingIds = new Set(prev.map((v) => String(v.userId)));
                                const others = currentParticipants.filter((p) => !p.isSelf && !existingIds.has(String(p.userId)));
                                return [...prev, ...others.map((p) => ({ userId: p.userId, name: p.name }))];
                            });
                            return currentParticipants;
                        });
                        setScreenStream(null);
                        remoteStreamRef.current = null;
                        if (remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = null;
                            remoteVideoRef.current.style.display = "block";
                        }
                    }
                } else if (data.type === "screen-share-stop") {
                    const stoppedUserId = data.userId || data.screenSharer?.user_id;
                    if (stoppedUserId) {
                        setScreenSharer((prev) => String(prev?.user_id) === String(stoppedUserId) ? null : prev);
                    }
                    if (String(stoppedUserId) === String(userId)) setScreenStream(null);
                    remoteStreamRef.current = null;
                    setScreenViewers([]);
                    if (remoteVideoRef.current && stoppedUserId) {
                        remoteVideoRef.current.srcObject = null;
                        remoteVideoRef.current.style.display = "block";
                    }
                }
            };
        }, 250);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (socket) {
                socket.onmessage = null;
                socket.onerror = null;
                if (socket.readyState === WebSocket.OPEN) {
                    try { socket.close(1000, "cleanup"); } catch (err) { console.log(err); }
                } else if (socket.readyState === WebSocket.CONNECTING) {
                    socket.onopen = () => { try { socket.close(1000, "cleanup"); } catch (err) { console.log(err); } };
                }
            }
            socketRef.current = null;
            socketQueueRef.current = [];
            socketReadyRef.current = false;
            Object.keys(peersRef.current).forEach((key) => closePeer(key));
        };
    }, [meetingLink, userId]);

    const handleScreenShare = async () => {
        try {
            if (isAnotherUserSharing) {
                showScreenShareNotice(`${getSharerLabel()} is already sharing the screen. Only one participant can share at a time.`);
                return;
            }
            if (screenStreamRef.current) return;
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            screenStreamRef.current = stream;
            setScreenStream(stream);
            setScreenSharer({ user_id: userId, name: displayName });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.style.objectFit = "contain";
                videoRef.current.style.backgroundColor = "#000";
                videoRef.current.play().catch(() => {});
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
                remoteVideoRef.current.style.display = "none";
            }

            const others = roomParticipantsRef.current.filter((p) => String(p.userId) !== String(userId));
            for (const member of others) {
                const peer = getOrCreatePeer(member.userId);
                await attachScreenTrackToPeer(peer, stream, member.userId);
            }

            setScreenViewers(others.map((p) => ({ userId: p.userId, name: p.name })));
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) videoTrack.onended = () => stopSharing();

            try {
                await startScreenShare(meetingLink, userId);
                safeSend({
                    type: "screen-share-start",
                    userId,
                    screenSharer: { user_id: userId, name: displayName },
                });
            } catch (err) {
                console.log(err);
            }
        } catch (err) {
            if (err?.name === "NotAllowedError") return;
            console.log(err);
        }
    };

    const stopSharing = async () => {
        const activeStream = screenStreamRef.current;
        if (activeStream) activeStream.getTracks().forEach((t) => t.stop());

        Object.entries(peersRef.current).forEach(([remoteUserId, peer]) => {
            try {
                peer.getSenders().forEach((sender) => {
                    if (sender.track && activeStream) {
                        const isScreenTrack = activeStream.getTracks().some((t) => t.id === sender.track.id);
                        if (isScreenTrack) peer.removeTrack(sender);
                    }
                });
                renegotiatePeer(peer, remoteUserId);
            } catch (err) {
                console.log(err);
            }
        });

        if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.style.objectFit = "contain";
            videoRef.current.style.backgroundColor = "transparent";
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.style.display = "block";
            remoteVideoRef.current.srcObject = null;
        }

        screenStreamRef.current = null;
        setScreenStream(null);
        setScreenSharer(null);
        setScreenShareNotice("");
        setScreenViewers([]);
        remoteStreamRef.current = null;

        try { await stopScreenShare(meetingLink, userId); } catch (err) { console.log(err); }
        safeSend({ type: "screen-share-stop", userId });
    };

    const screenShareTiles = useMemo(() => {
        const map = new Map();
        map.set(String(userId), { userId, name: displayName, isSelf: true });
        roomParticipants.forEach((p) => {
            if (!p.isSelf) map.set(String(p.userId), { ...p, isSelf: false });
        });
        screenViewers.forEach((v) => {
            if (!map.has(String(v.userId))) map.set(String(v.userId), { userId: v.userId, name: v.name, isSelf: false });
        });
        return Array.from(map.values());
    }, [roomParticipants, screenViewers, userId, displayName]);

    // Expose control hook triggers cleanly when rendering or via custom layout requirements
    if (!isScreenSharing) return null;

    return (
        <div className="absolute inset-0 bg-[#0e0e10] flex flex-col">
            {screenShareNotice && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-xl z-50 shadow-lg">
                    {screenShareNotice}
                </div>
            )}
            <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-5 pt-4 pointer-events-none">
                <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg">
                    <Monitor size={15} className="text-green-400" />
                    <span>
                        {isLocalScreenSharing ? `${displayName} (You, presenting)` : `${getSharerLabel()} is presenting`}
                    </span>
                </div>
                {isLocalScreenSharing && (
                    <button
                        onClick={stopSharing}
                        className="pointer-events-auto flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg transition"
                    >
                        <X size={14} /> Stop presenting
                    </button>
                )}
            </div>

            <div className="absolute inset-0 flex items-center justify-center pt-14 pb-[118px] px-4">
                {isLocalScreenSharing ? (
                    <video autoPlay playsInline muted ref={videoRef} className="w-full h-full object-contain rounded-xl bg-black" />
                ) : (
                    <video
                        autoPlay
                        playsInline
                        key={screenSharer?.user_id || "remote-share"}
                        ref={(el) => {
                            remoteVideoRef.current = el;
                            if (el && remoteStreamRef.current) {
                                el.srcObject = remoteStreamRef.current;
                                el.play().catch(() => {});
                            }
                        }}
                        className="w-full h-full object-contain rounded-xl bg-black"
                    />
                )}
            </div>

            <div
                className="absolute bottom-0 left-0 right-0 h-[110px] flex items-center px-5 gap-3 overflow-x-auto z-40"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 70%, transparent)" }}
            >
                {screenShareTiles.map((tile) => (
                    <ParticipantTile key={tile.userId} name={tile.name} isSelf={tile.isSelf} isMuted={tile.isSelf ? !isMicOn : false} />
                ))}
            </div>
        </div>
    );
};

export default ScreenShareModule;