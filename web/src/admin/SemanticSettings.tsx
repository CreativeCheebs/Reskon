import { useEffect, useState } from "react";
import { Alert, Button, Space, Tag, Typography } from "antd";
import { api } from "../api";
import { message } from "../theme/feedback";
import { useAuth } from "../auth/AuthGate";

// Duplicate search's local model (GET /api/semantic). Word matching always
// works; the model adds matching by meaning. It runs inside JitterBug on
// this computer: downloaded once (an admin starts it), then offline.

interface Status {
  model: string;
  state: "missing" | "downloading" | "ready" | "error" | "off";
  error?: string;
  download_bytes: number;
}

const LABEL: Record<Status["state"], { text: string; color?: string }> = {
  ready: { text: "Ready", color: "green" },
  downloading: { text: "Downloading…", color: "blue" },
  missing: { text: "Not downloaded" },
  error: { text: "Failed", color: "red" },
  off: { text: "Off" },
};

export function SemanticSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const load = () => api.get<Status>("/semantic").then(setStatus).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  // While it downloads, look again every two seconds.
  useEffect(() => {
    if (status?.state !== "downloading") return;
    const t = window.setInterval(load, 2000);
    return () => window.clearInterval(t);
  }, [status?.state]);

  const download = async () => {
    try {
      setStatus(await api.post<Status>("/semantic/download", {}));
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  if (!status) return null;
  const l = LABEL[status.state];
  return (
    <Space direction="vertical" size={10} style={{ maxWidth: 620 }}>
      <Space>
        <span>Model</span>
        <code>{status.model}</code>
        <Tag color={l.color}>{l.text}</Tag>
      </Space>
      {status.state === "error" && <Alert type="error" showIcon message="The model could not be loaded" description={status.error} />}
      {(status.state === "missing" || status.state === "error") &&
        (user?.is_admin ? (
          <Button size="small" type="primary" onClick={download}>
            Download the model ({Math.round(status.download_bytes / (1 << 20))} MB, once)
          </Button>
        ) : (
          <Typography.Text type="secondary">An admin can download it here.</Typography.Text>
        ))}
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
        Matching by words always works. With the model, titles that mean the same thing match too ("doctor about stomach acid" finds "Planning for
        heartburn diagnosis"). It runs on this server's CPU, about 30 ms a search, and nothing is sent anywhere. The first search after
        adding many tasks reads them in the background for a few seconds.
      </Typography.Paragraph>
    </Space>
  );
}
