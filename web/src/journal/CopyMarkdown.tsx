import { useRef, useState } from "react";
import { Button, Input, Modal, Tooltip } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import type { TextAreaRef } from "antd/es/input/TextArea";
import dayjs from "dayjs";
import { message } from "../theme/feedback";

// "Copy as Markdown" for one day, on the Sessions screen and in the journal
// widget. The text is made by the server (GET /api/journal); this only
// puts it on the clipboard. When the text is already in hand the copy
// happens inside the click, which browsers require. When it is not (it is
// still on its way, or could not be fetched), the click asks for it first.
//
// Browsers only offer the clipboard on a secure address (https or
// localhost); Reskon is often opened over plain http on a home network. So
// there are three steps: the clipboard, then the older copy command, then a
// box with the text selected for copying by hand.

/** Copies text; false when the browser would not let it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (no permission, or not a secure address): try the older way.
  }
  const before = document.activeElement as HTMLElement | null;
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", "");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(box);
  try {
    // Focus first: some browsers copy only from the focused box.
    box.focus();
    box.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    box.remove();
    before?.focus?.();
  }
}

export function CopyMarkdownButton({
  day,
  markdown,
  fetchMarkdown,
}: {
  day: string;
  /** The day's text, when it is already known. */
  markdown?: string;
  /** Asks the server for the day's text (null when it cannot), used when it is not known yet. */
  fetchMarkdown?: () => Promise<string | null>;
}) {
  const [byHand, setByHand] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<TextAreaRef>(null);
  const when = dayjs(day).format("ddd D MMM");
  const click = async () => {
    let text: string | null | undefined = markdown;
    if (text === undefined && fetchMarkdown) {
      setBusy(true);
      text = await fetchMarkdown();
      setBusy(false);
    }
    if (text === undefined || text === null) {
      message.error(`Could not get ${when} as Markdown. Try again.`);
      return;
    }
    if (await copyText(text)) message.success("Copied");
    else setByHand(text);
  };
  const unavailable = markdown === undefined && !fetchMarkdown;
  return (
    <>
      <Tooltip title={unavailable ? "Not ready yet" : "Copy this day's sessions and notes, ready to paste into a journal"}>
        {/* A disabled button swallows the tooltip's events, so the span carries them. */}
        <span style={{ display: "inline-flex" }}>
          <Button size="small" type="text" icon={<CopyOutlined />} disabled={unavailable} loading={busy} onClick={click} aria-label={`Copy as Markdown, ${when}`}>
            Copy as Markdown
          </Button>
        </span>
      </Tooltip>
      <Modal
        open={byHand !== null}
        // The widget is dragged by anything not marked no-drag, and the box sits inside it.
        wrapClassName="no-drag"
        title={`Copy ${when} by hand`}
        footer={<Button onClick={() => setByHand(null)}>Close</Button>}
        onCancel={() => setByHand(null)}
        afterOpenChange={(open) => {
          if (open) {
            box.current?.focus();
            box.current?.resizableTextArea?.textArea?.select();
          }
        }}
      >
        <p>This browser does not let Reskon copy for you here. The text is selected: press Ctrl+C (Cmd+C on a Mac), then paste it where you want it.</p>
        <Input.TextArea ref={box} readOnly value={byHand ?? ""} autoSize={{ minRows: 6, maxRows: 16 }} aria-label={`${when} as Markdown`} style={{ fontFamily: "monospace" }} />
      </Modal>
    </>
  );
}
