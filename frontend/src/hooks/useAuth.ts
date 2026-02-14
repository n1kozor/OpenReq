import { useState, useCallback, useEffect } from "react";
import type { User } from "@/types";
import { authApi, usersApi } from "@/api/endpoints";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem("openreq-token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await usersApi.me();
      setUser(data);
    } catch {
      localStorage.removeItem("openreq-token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem("openreq-token", data.access_token);
    await fetchUser();
  }, [fetchUser]);

  const logout = useCallback(() => {
    localStorage.removeItem("openreq-token");
    setUser(null);
  }, []);

  return { user, loading, login, logout, refetchUser: fetchUser };
}
