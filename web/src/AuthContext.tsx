import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

type AuthState = {
  email: string | null;
  role: string | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((u) => {
        setEmail(u.email);
        setRole(u.role);
      })
      .catch(() => {
        setEmail(null);
        setRole(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (e: string, password: string, rememberMe?: boolean) => {
    const u = await api.login(e, password, rememberMe);
    setEmail(u.email);
    setRole(u.role);
  };

  const logout = async () => {
    await api.logout();
    setEmail(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ email, role, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
