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

// Silent token refresh: refresh token every 6 hours of active use
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
let lastRefresh = Date.now();

async function maybeRefreshToken() {
  const token = localStorage.getItem("openreq-token");
  if (!token || IS_STANDALONE) return;
  if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;

  try {
    const res = await axios.post(
      `${API_URL}/api/v1/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.data?.access_token) {
      localStorage.setItem("openreq-token", res.data.access_token);
      lastRefresh = Date.now();
    }
  } catch {
    // If refresh fails, let the 401 interceptor handle logout
  }
}

client.interceptors.request.use(async (config) => {
  // Don't refresh on the refresh call itself
  if (!config.url?.includes("/auth/refresh")) {
    await maybeRefreshToken();
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!IS_STANDALONE && error.response?.status === 401) {
      localStorage.removeItem("openreq-token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default client;
