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
      localStorage.setItem("cc_user", JSON.stringify(payload.user));
      setUser(payload.user);
    },
    updateUser(nextUser) {
      localStorage.setItem("cc_user", JSON.stringify(nextUser));
      setUser(nextUser);
    },
    logout() { localStorage.removeItem("cc_token"); localStorage.removeItem("cc_user"); setUser(null); }
  }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
