import { microserviceApi } from "../services/api.js";

export const startScreenShare = (
    meetingLink,
    userId
) => {
    return microserviceApi.post(
        `/api/meetings/start-screen-share/`,
        {
            meeting_link: meetingLink,
            user_id: userId
        }
    );
};

export const stopScreenShare = (meetingLink, userId) => {
    return microserviceApi.post(`/api/meetings/stop-screen-share/`, {
        meeting_link: meetingLink,
        user_id: userId,
    });
};

export const getScreenSharer = (meetingLink) => {
    return microserviceApi.get(
        `/api/meetings/current-screen-sharer/${meetingLink}/`
    );
};