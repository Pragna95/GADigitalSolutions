export const createPeerConnection = (onTrack, onIceCandidate) => {
    const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peer.ontrack = (event) => {
        if (onTrack && event.streams && event.streams[0]) {
            onTrack(event.streams[0]);
        }
    };

    peer.onicecandidate = (event) => {
        if (event.candidate && onIceCandidate) {
            onIceCandidate(event.candidate);
        }
    };

    return peer;
};