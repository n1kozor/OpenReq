import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "";

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

// No 401 interceptor — token never expires, so we never auto-logout.
// The only way to log out is the explicit Logout button.
client.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
);

export default client;
