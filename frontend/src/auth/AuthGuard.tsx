import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Role } from "../types";

interface AuthGuardProps { roles?: Role[] }

export function AuthGuard({ roles }: AuthGuardProps): JSX.Element {
  const { user } = useAuth();
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

