import { useEffect, useRef, useState } from "react";
import { Input, Modal, Typography, type InputRef } from "antd";
import { message } from "../theme/feedback";
import { useApp } from "../store";
import { useInbox } from "./useInbox";

// Ctrl/⌘+I anywhere: drop a bare line in the inbox. Nothing is asked and
// nothing is parsed; Enter saves and leaves the box open for the next one,
// Escape closes. Sorting it out happens later, on the Inbox screen.

export const INBOX_SHORTCUT = "Ctrl/⌘+I";

export function InboxQuickAdd() {
  const { online } = useApp();
  const { add } = useInbox();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [added, setAdded] = useState(0);
  const input = useRef<InputRef>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setAdded(0);
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const save = async () => {
    if (!text.trim()) return;
    try {
      await add(text.trim());
      setText("");
      setAdded((n) => n + 1);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      title="Add to inbox"
      footer={null}
      width={520}
      onCancel={() => setOpen(false)}
      destroyOnClose
      transitionName=""
      maskTransitionName=""
      afterOpenChange={(o) => o && input.current?.focus()}
    >
      <Input
        ref={input}
        autoFocus
        size="large"
        placeholder={online ? "Anything. Sort it out later." : "Offline — the inbox needs the server for now"}
        disabled={!online}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPressEnter={save}
      />
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        Enter adds it and keeps the box open · Esc closes{added ? ` · ${added} added` : ""}
      </Typography.Text>
    </Modal>
  );
}
