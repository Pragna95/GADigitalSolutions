import axios from "axios";

const API = "http://127.0.0.1:8000/api/meetings";

export const startScreenShare = (
    meetingLink,
    userId
) => {

    return axios.post(
        `${API}/start-screen-share/`,
        {
            meeting_link: meetingLink,
            user_id: userId
        }
    );

};

export const stopScreenShare = (meetingLink, userId) => {
    return axios.post(`${API}/stop-screen-share/`, {
        meeting_link: meetingLink,
        user_id: userId,
    });
};

export const getScreenSharer = (meetingLink) => {
    return axios.get(
        `${API}/current-screen-sharer/${meetingLink}/`
    );
};