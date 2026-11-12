import { useState } from "react";
import { Alert, Button, Form, Input, Typography } from "antd";
import { api, ApiError } from "../api";
import { palette } from "../theme/palette";
import type { User } from "./AuthGate";
import { APP_VERSION } from "../version";

// Sign in, or on a brand-new server create the first (admin) account.

export function LoginPage({ setup, tokenRequired = false, onSignedIn }: { setup: boolean; tokenRequired?: boolean; onSignedIn: (u: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (v: { username: string; password: string; confirm?: string; setup_token?: string }) => {
    setError(null);
    if (setup && v.password !== v.confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ user: User }>(setup ? "/auth/setup" : "/auth/login", {
        username: v.username,
        password: v.password,
        ...(setup && tokenRequired ? { setup_token: v.setup_token } : {}),
      });
      onSignedIn(r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail || e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: palette.bg }}>
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: palette.panel,
          border: `1px solid ${palette.border}`,
          borderRadius: 6,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Reskon <span style={{ fontSize: 12, fontWeight: 400, color: palette.muted }}>{APP_VERSION}</span>
        </div>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {setup
            ? "Welcome. Create the admin account — you can add other people afterwards. Each person's data is kept separate."
            : "Sign in to continue."}
        </Typography.Paragraph>
        {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} showIcon />}
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          {setup && tokenRequired && (
            <Form.Item name="setup_token" label="Setup token" extra="The word set as JITTERBUG_SETUP_TOKEN when this server was started." rules={[{ required: true }]}>
              <Input.Password autoComplete="off" />
            </Form.Item>
          )}
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input autoFocus autoComplete="username" autoCapitalize="none" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true }, ...(setup ? [{ min: 8, message: "At least 8 characters" }] : [])]}
          >
            <Input.Password autoComplete={setup ? "new-password" : "current-password"} />
          </Form.Item>
          {setup && (
            <Form.Item name="confirm" label="Confirm password" rules={[{ required: true }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block loading={busy}>
            {setup ? "Create admin account" : "Sign in"}
          </Button>
        </Form>
      </div>
    </div>
  );
}
