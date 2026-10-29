import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button, Result, Spin } from "antd";
import { api } from "../api";
import { LoginPage } from "./LoginPage";

// Decides between first-run setup, the login page and the app. Everything
// inside is keyed by the user, so switching account starts from clean state.

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
  disabled_at: string | null;
}

interface AuthState {
  user: User;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthGate");
  return v;
}

type Status = { setup_needed: boolean; user: User | null };

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<Status>("/auth/status"));
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    load();
    const onSignedOut = () => setStatus((s) => (s ? { ...s, user: null } : s));
    window.addEventListener("jitterbug:signed-out", onSignedOut);
    return () => window.removeEventListener("jitterbug:signed-out", onSignedOut);
  }, [load]);

  // Keep retrying while the server is unreachable.
  useEffect(() => {
    if (!unreachable) return;
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, [unreachable, load]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setStatus((s) => (s ? { ...s, user: null } : s));
  }, []);

  if (!status)
    return unreachable ? (
      <Result status="warning" title="Can't reach the JitterBug server" subTitle="Retrying every few seconds." extra={<Button onClick={load}>Retry now</Button>} />
    ) : (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin />
      </div>
    );

  if (!status.user) return <LoginPage setup={status.setup_needed} onSignedIn={(user) => setStatus({ setup_needed: false, user })} />;

  return (
    <Ctx.Provider value={{ user: status.user, logout }}>
      <div key={status.user.id} style={{ display: "contents" }}>
        {children}
      </div>
    </Ctx.Provider>
  );
}
