import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import { CaptureModal } from "./CaptureModal";

// Round button in the sidebar header, on every screen, plus Ctrl/⌘+K
// anywhere. It sits outside the content area so it never covers a column,
// a card or a scrollbar (see docs/deviations.md).

export function CaptureButton() {
  const { online } = useApp();
  const [open, setOpen] = useState(false);
  // Keys typed between Ctrl+K and the input taking focus. Without this the
  // first few characters of a fast typist are lost. null = not buffering.
  const early = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        early.current = "";
        setOpen(true);
        return;
      }
      // Once the capture input itself has focus, keys go to it natively.
      if (early.current === null || document.activeElement?.hasAttribute("data-capture-input")) return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        early.current += e.key;
        e.preventDefault();
      } else if (e.key === "Backspace") {
        early.current = early.current.slice(0, -1);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /** Hands over (once) whatever was typed before the input had focus. */
  const takeEarlyKeys = () => {
    const s = early.current ?? "";
    early.current = null;
    return s;
  };

  return (
    <>
      <Tooltip title={online ? "Quick capture (Ctrl/⌘+K)" : OFFLINE_TIP} placement="right">
        <Button
          type="primary"
          shape="circle"
          aria-label="Quick capture"
          // An icon, not a "+" character: a glyph sits on the text baseline,
          // off centre; the icon is centred in the circle both ways.
          icon={<PlusOutlined style={{ fontSize: 14 }} />}
          style={{ width: 28, height: 28, minWidth: 28, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: online ? 1 : 0.5 }}
          onClick={() => {
            if (!online) return;
            early.current = "";
            setOpen(true);
          }}
        />
      </Tooltip>
      {open && (
        <CaptureModal
          takeEarlyKeys={takeEarlyKeys}
          onClose={() => {
            early.current = null;
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
