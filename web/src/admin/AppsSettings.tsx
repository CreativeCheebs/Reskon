import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Alert, Form, Input, Popconfirm, Space, Spin, Tag, Typography } from "antd";
import { message } from "../theme/feedback";
import { api, ApiError } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { palette } from "../theme/palette";
import { formatDateTime } from "../format";
import type { AppManifest, AuthKind, ConnectedApp, Credentials } from "../apps/types";

// Settings › Apps: connect an app (a plugin) by its address, sign in to it
// once, and see whether it answers. Reskon keeps the sign-in on the server;
// it is never shown here again.

const STATUS: Record<ConnectedApp["status"], { label: string; color: string }> = {
  ok: { label: "Reachable", color: "green" },
  unreachable: { label: "Can't reach it", color: "orange" },
  invalid: { label: "Problem", color: "red" },
};

/** The sign-in boxes an app asks for. new-password keeps the browser from
 *  filling in the person's saved Reskon login, which would go to the app. */
function SignInFields({ kind, name, value, onChange }: { kind: AuthKind; name: string; value: Credentials; onChange: (c: Credentials) => void }) {
  // Ids tie each box to its label, so screen readers say what it is.
  const id = useId();
  if (kind === "none") return <Typography.Paragraph type="secondary">{name} needs no sign-in.</Typography.Paragraph>;
  if (kind === "token")
    return (
      <Form.Item label={`${name} token`} htmlFor={`${id}-token`} help={`The token ${name} shows in its own settings. Reskon keeps it on the server.`}>
        <Input.Password id={`${id}-token`} name="app-token" autoComplete="new-password" value={value.token ?? ""} onChange={(e) => onChange({ token: e.target.value })} />
      </Form.Item>
    );
  return (
    <>
      <Form.Item label={`${name} username`} htmlFor={`${id}-user`}>
        <Input id={`${id}-user`} name="app-username" autoComplete="off" value={value.username ?? ""} onChange={(e) => onChange({ ...value, username: e.target.value })} />
      </Form.Item>
      <Form.Item label={`${name} password`} htmlFor={`${id}-pass`} help="Used once to sign in; Reskon keeps only the sign-in it gets back, not the password.">
        <Input.Password
          id={`${id}-pass`}
          name="app-password"
          autoComplete="new-password"
          value={value.password ?? ""}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
        />
      </Form.Item>
    </>
  );
}

function WidgetList({ m }: { m: AppManifest }) {
  if (m.widgets.length === 0) return <Typography.Text type="secondary">No widgets.</Typography.Text>;
  return (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
      {m.widgets.map((w) => (
        <li key={w.id}>
          {w.title} <Typography.Text type="secondary">({w.kind === "page" ? "its own page" : `data: ${w.shape}`})</Typography.Text>
        </li>
      ))}
    </ul>
  );
}

function AddApp({ onAdded }: { onAdded: () => void }) {
  const [address, setAddress] = useState("");
  const [preview, setPreview] = useState<{ address: string; manifest: AppManifest } | null>(null);
  const [creds, setCreds] = useState<Credentials>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest look-up counts: an older, slower answer must not bring
  // back a preview for an address no longer in the box.
  const seq = useRef(0);

  // A new address starts clean: sign-in details typed for one app are never
  // sent to another.
  const reset = () => {
    seq.current++;
    setPreview(null);
    setCreds({});
    setError(null);
    setBusy(false);
  };
  const look = async () => {
    reset();
    const n = seq.current;
    setBusy(true);
    try {
      const p = await api.post<{ address: string; manifest: AppManifest }>("/apps/preview", { address });
      if (n === seq.current) setPreview(p);
    } catch (e) {
      if (n === seq.current) setError((e as Error).message);
    } finally {
      if (n === seq.current) setBusy(false);
    }
  };
  const connect = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<ConnectedApp>("/apps", { address: preview.address, ...creds });
      message.success(`${preview.manifest.name} connected`);
      setAddress("");
      reset();
      onAdded();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      {/* Two forms: Enter in the address box always looks the app up; Enter
          in the sign-in boxes connects. */}
      <Form layout="vertical" size="small" onFinish={look}>
        <Form.Item label="App address" htmlFor="app-address" help="Where the app runs, such as http://192.168.0.8:5000">
          <Space.Compact style={{ width: "100%" }}>
            <Input
              id="app-address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                reset();
              }}
              placeholder="http://192.168.0.8:5000"
            />
            <WriteButton htmlType="submit" loading={busy && !preview} disabled={busy}>
              Look up
            </WriteButton>
          </Space.Compact>
        </Form.Item>
      </Form>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      {preview && (
        <Form layout="vertical" size="small" onFinish={connect}>
          <div style={{ border: `1px solid ${palette.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <Typography.Text strong>{preview.manifest.name}</Typography.Text>{" "}
            {preview.manifest.version && <Typography.Text type="secondary">version {preview.manifest.version}</Typography.Text>}
            <div style={{ margin: "6px 0 10px" }}>
              Offers:
              <WidgetList m={preview.manifest} />
            </div>
            <SignInFields kind={preview.manifest.auth.kind} name={preview.manifest.name} value={creds} onChange={setCreds} />
            <WriteButton type="primary" htmlType="submit" loading={busy}>
              Connect {preview.manifest.name}
            </WriteButton>
          </div>
        </Form>
      )}
    </div>
  );
}

type Busy = "check" | "sign" | "remove" | null;

function AppRow({ app, onChanged }: { app: ConnectedApp; onChanged: () => void }) {
  const [signing, setSigning] = useState(false);
  const [creds, setCreds] = useState<Credentials>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const st = STATUS[app.status];

  /** Runs one action; true when it worked. Errors are shown, never thrown. */
  const run = async (what: Exclude<Busy, null>, call: () => Promise<unknown>, done: string, showError: (m: string) => void): Promise<boolean> => {
    setBusy(what);
    try {
      await call();
      message.success(done);
      onChanged();
      return true;
    } catch (e) {
      showError((e as Error).message);
      // Gone already (removed in another tab): show the list as it is now.
      if (e instanceof ApiError && e.status === 404) onChanged();
      return false;
    } finally {
      setBusy(null);
    }
  };
  const toast = (m: string) => message.error(m);

  return (
    <div style={{ border: `1px solid ${palette.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Typography.Text strong>{app.name}</Typography.Text>
        <Tag color={st.color}>{st.label}</Tag>
        {!app.signed_in && <Tag color="orange">Not signed in</Tag>}
        <span style={{ flex: 1 }} />
        <WriteButton
          size="small"
          aria-label={`Check ${app.name} again`}
          loading={busy === "check"}
          disabled={busy !== null && busy !== "check"}
          onClick={() => run("check", () => api.post(`/apps/${app.id}/check`), `${app.name} checked`, toast)}
        >
          Check again
        </WriteButton>
        {app.auth_kind !== "none" && (
          <WriteButton
            size="small"
            aria-label={`Sign in to ${app.name} again`}
            aria-expanded={signing}
            disabled={busy !== null}
            onClick={() => {
              setSigning((v) => !v);
              setSignError(null);
            }}
          >
            Sign in again
          </WriteButton>
        )}
        <Popconfirm
          title={`Remove ${app.name}?`}
          description="Reskon forgets the app and its sign-in. The app itself and its data are not touched."
          okText="Remove"
          onConfirm={() => run("remove", () => api.del(`/apps/${app.id}`), `${app.name} removed`, toast)}
        >
          <WriteButton size="small" danger aria-label={`Remove ${app.name}`} loading={busy === "remove"} disabled={busy !== null && busy !== "remove"}>
            Remove
          </WriteButton>
        </Popconfirm>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {app.address} · checked {formatDateTime(app.checked_at)}
      </Typography.Text>
      {app.status_detail && <div style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>{app.status_detail}</div>}
      {app.manifest && (
        <div style={{ marginTop: 6 }}>
          <WidgetList m={app.manifest} />
        </div>
      )}
      {signing && (
        <Form
          layout="vertical"
          size="small"
          style={{ maxWidth: 420, marginTop: 10 }}
          onFinish={async () => {
            setSignError(null);
            // Closed and cleared only when it worked; a wrong password keeps what was typed.
            if (await run("sign", () => api.post(`/apps/${app.id}/sign-in`, creds), `Signed in to ${app.name}`, setSignError)) {
              setSigning(false);
              setCreds({});
            }
          }}
        >
          <SignInFields kind={app.auth_kind} name={app.name} value={creds} onChange={setCreds} />
          {signError && <Alert type="error" showIcon message={signError} style={{ marginBottom: 12 }} />}
          <WriteButton type="primary" htmlType="submit" loading={busy === "sign"}>
            Sign in
          </WriteButton>
        </Form>
      )}
    </div>
  );
}

export function AppsSettings() {
  const { reloadKey } = useApp();
  const [list, setList] = useState<ConnectedApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .get<ConnectedApp[]>("/apps")
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load, reloadKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <Alert type="error" showIcon message={error} />}
      {list === null && !error ? (
        <Spin />
      ) : (
        list &&
        (list.length === 0 ? (
          <Typography.Text type="secondary">No apps connected yet.</Typography.Text>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((a) => (
              <AppRow key={a.id} app={a} onChanged={load} />
            ))}
          </div>
        ))
      )}
      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Connect an app
        </Typography.Title>
        <AddApp onAdded={load} />
      </div>
    </div>
  );
}
