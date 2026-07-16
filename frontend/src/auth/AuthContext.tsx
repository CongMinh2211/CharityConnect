import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { api } from "../lib/api";
import type { AuthPayload, User } from "../types";

interface AuthContextValue {
  user: User | null;
  login(payload: AuthPayload): void;
  updateUser(user: User): void;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_EVENT_KEY = "cc_auth_event";

function publishAuthEvent(action: "LOGIN" | "LOGOUT" | "PROFILE_UPDATED"): void {
  localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ action, at: Date.now() }));
}

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("cc_user");
    return saved ? JSON.parse(saved) as User : null;
  });
  const clearLocalAuth = useCallback((broadcast = true) => {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_refresh_token");
    localStorage.removeItem("cc_user");
    if (broadcast) publishAuthEvent("LOGOUT");
    setUser(null);
  }, []);

  const login = useCallback((payload: AuthPayload) => {
      localStorage.setItem("cc_token", payload.token);
      if (payload.refresh_token) localStorage.setItem("cc_refresh_token", payload.refresh_token);
      localStorage.setItem("cc_user", JSON.stringify(payload.user));
      setUser(payload.user);
      publishAuthEvent("LOGIN");
  }, []);

  const updateUser = useCallback((nextUser: User) => {
      localStorage.setItem("cc_user", JSON.stringify(nextUser));
      setUser(nextUser);
      publishAuthEvent("PROFILE_UPDATED");
  }, []);

  const logout = useCallback(() => {
      const refreshToken = localStorage.getItem("cc_refresh_token");
      if (refreshToken) {
        // Thu hồi refresh token phía server; không chặn UI nếu máy chủ đang lỗi.
        void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }).catch(() => undefined);
      }
      clearLocalAuth(true);
  }, [clearLocalAuth]);

  // Khi admin khóa tài khoản hoặc thu hồi session, backend trả 401/403 cho
  // /profile. Poll ngắn giúp tab đang mở tự thoát mà không cần tải lại trang.
  useEffect(() => {
    if (!user) return undefined;
    let stopped = false;
    const validateSession = async () => {
      try {
        const current = await api<User>("/profile");
        if (stopped) return;
        if (current.status === "DISABLED") {
          clearLocalAuth(true);
          return;
        }
        setUser((previous) => {
          if (!previous || previous.id !== current.id) return current;
          if (JSON.stringify(previous) === JSON.stringify(current)) return previous;
          localStorage.setItem("cc_user", JSON.stringify(current));
          return current;
        });
      } catch (reason) {
        const status = (reason as { status?: number }).status;
        if (!stopped && (status === 401 || status === 403)) clearLocalAuth(true);
      }
    };
    const interval = window.setInterval(() => void validateSession(), 12_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void validateSession(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, clearLocalAuth]);

  // localStorage event phát sang các tab khác cùng origin. Nhờ đó logout,
  // khóa tài khoản hoặc cập nhật hồ sơ được đồng bộ giữa mọi tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "cc_user" && event.key !== AUTH_EVENT_KEY) return;
      const saved = localStorage.getItem("cc_user");
      if (!saved) {
        setUser(null);
        return;
      }
      try { setUser(JSON.parse(saved) as User); }
      catch { clearLocalAuth(false); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clearLocalAuth]);

  const value = useMemo<AuthContextValue>(() => ({ user, login, updateUser, logout }), [user, login, updateUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
