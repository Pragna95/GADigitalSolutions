export const createSocket = (meetingId) => {
    return new WebSocket(`ws://127.0.0.1:8000/ws/meeting/${meetingId}/`);
};