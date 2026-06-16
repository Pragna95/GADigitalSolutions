import axios from "axios";
// import "@/lib/api"; // Import lib/api to register global request interceptors

const dataURL = import.meta.env.VITE_DATA_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${dataURL}`,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    // You can modify the config here before sending the request
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh");
        if (refreshToken) {
          const res = await axios.post(`${dataURL}/api/auth/refresh/`, { refresh: refreshToken });
          if (res.data && res.data.access) {
            localStorage.setItem("token", res.data.access);
            originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
            return api(originalRequest);
          }
        }
      } catch (refreshError) {
        // Refresh token is expired or invalid
        localStorage.removeItem("token");
        localStorage.removeItem("refresh");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export const microserviceApi = axios.create({
  baseURL: import.meta.env.VITE_MICROSERVICE_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

// microserviceApi.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem("token");
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`;
//     }
//     return config;
//   },
//   (error) => {
//     return Promise.reject(error);
//   }
// );

// microserviceApi.interceptors.response.use(
//   (response) => {
//     return response;
//   },
//   (error) => {
//     return Promise.reject(error);
//   }
// );

export default api;