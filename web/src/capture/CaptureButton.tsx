import { useEffect, useState } from "react";
import { FloatButton, Tooltip } from "antd";
import { useApp } from "../store";
import { OFFLINE_TIP } from "../offline";
import { CaptureModal } from "./CaptureModal";

// Round button, bottom right, on every screen, plus Ctrl/⌘+K anywhere.

export function CaptureButton() {
  const { online } = useApp();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Tooltip title={online ? "Quick capture (Ctrl/⌘+K)" : OFFLINE_TIP} placement="left">
        <FloatButton
          type="primary"
          shape="circle"
          icon={<span style={{ fontSize: 20, lineHeight: "20px" }}>+</span>}
          style={{ right: 24, bottom: 24, width: 48, height: 48, opacity: online ? 1 : 0.5 }}
          onClick={() => online && setOpen(true)}
        />
      </Tooltip>
      {open && <CaptureModal onClose={() => setOpen(false)} />}
    </>
  );
}
