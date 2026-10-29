import { useEffect, useRef, useState } from "react";
import { FloatButton, Tooltip } from "antd";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import { CaptureModal } from "./CaptureModal";

// Round button, bottom right, on every screen, plus Ctrl/⌘+K anywhere.

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
      <Tooltip title={online ? "Quick capture (Ctrl/⌘+K)" : OFFLINE_TIP} placement="left">
        <FloatButton
          type="primary"
          shape="circle"
          icon={<span style={{ fontSize: 20, lineHeight: "20px" }}>+</span>}
          style={{ right: 24, bottom: 24, width: 48, height: 48, opacity: online ? 1 : 0.5 }}
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
