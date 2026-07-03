import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import type { AuthPayload, User } from "../types";

interface AuthContextValue {
  user: User | null;
  login(payload: AuthPayload): void;
  updateUser(user: User): void;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("cc_user");
    return saved ? JSON.parse(saved) as User : null;
  });
  const value = useMemo<AuthContextValue>(() => ({
    user,
    login(payload) {
      localStorage.setItem("cc_token", payload.token);
      if (payload.refresh_token) localStorage.setItem("cc_refresh_token", payload.refresh_token);
      localStorage.setItem("cc_user", JSON.stringify(payload.user));
      setUser(payload.user);
    },
    updateUser(nextUser) {
      localStorage.setItem("cc_user", JSON.stringify(nextUser));
      setUser(nextUser);
    },
    logout() {
      const refreshToken = localStorage.getItem("cc_refresh_token");
      if (refreshToken) {
        // Thu hồi refresh token phía server; không chặn UI nếu thất bại.
        void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }).catch(() => undefined);
      }
      localStorage.removeItem("cc_token");
      localStorage.removeItem("cc_refresh_token");
      localStorage.removeItem("cc_user");
      setUser(null);
    }
  }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
