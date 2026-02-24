import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "";
const IS_STANDALONE = import.meta.env.VITE_STANDALONE === "true";

const client = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("openreq-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      !IS_STANDALONE &&
      error.response?.status === 401 &&
      !error.config?.url?.includes("/auth/")
    ) {
      localStorage.removeItem("openreq-token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default client;
