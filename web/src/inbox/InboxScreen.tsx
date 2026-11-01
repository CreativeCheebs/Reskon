import { useState } from "react";
import { Button, Empty, Input, Typography } from "antd";
import { message } from "../theme/feedback";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { formatAge } from "../format";
import { palette } from "../theme/palette";
import { PageHeader } from "../theme/Toolbar";
import { CaptureModal } from "../capture/CaptureModal";
import { INBOX_SHORTCUT } from "./InboxQuickAdd";
import { useInbox, type InboxItem } from "./useInbox";

// The inbox: lines dropped in with Ctrl/⌘+I, oldest first. Process reads a
// line through quick capture, where it becomes tasks or sessions once
// confirmed; only then does it leave the inbox. Discard drops it.

export function InboxScreen() {
  const { online } = useApp();
  const { items, add, triage, discard } = useInbox();
  const [text, setText] = useState("");
  const [processing, setProcessing] = useState<InboxItem | null>(null);

  const save = async () => {
    if (!text.trim()) return;
    try {
      await add(text.trim());
      setText("");
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const drop = async (it: InboxItem) => {
    try {
      await discard(it.id);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const ageH = (at: string) => (Date.now() - new Date(at).getTime()) / 3.6e6;

  return (
    <div style={{ maxWidth: 760, width: "100%" }}>
      <PageHeader title={`Inbox${items.length ? ` · ${items.length}` : ""}`} />
      <Input
        size="middle"
        placeholder={`Add a line · ${INBOX_SHORTCUT} adds from anywhere`}
        value={text}
        disabled={!online}
        onChange={(e) => setText(e.target.value)}
        onPressEnter={save}
        style={{ marginBottom: 12 }}
      />
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing waiting." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${palette.border}`, borderRadius: 8 }}>
          {items.map((it, i) => (
            <div
              key={it.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i ? `1px solid ${palette.border}` : undefined }}
            >
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{it.text}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12, flex: "none" }}>
                {formatAge(ageH(it.created_at))} ago
              </Typography.Text>
              <WriteButton size="small" type="primary" ghost onClick={() => setProcessing(it)}>
                Process
              </WriteButton>
              <Button size="small" type="text" disabled={!online} onClick={() => drop(it)}>
                Discard
              </Button>
            </div>
          ))}
        </div>
      )}
      {processing && (
        <CaptureModal
          initialText={processing.text}
          onSaved={() => triage(processing.id).catch((e) => message.error((e as Error).message))}
          onClose={() => setProcessing(null)}
        />
      )}
    </div>
  );
}
