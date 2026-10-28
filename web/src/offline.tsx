import { Button, Tooltip, type ButtonProps } from "antd";
import { useApp } from "./store";

// Offline means read-only. Write actions are disabled, never hidden: a
// greyed button with a tooltip explains itself; a vanished one reads as a bug.

export const OFFLINE_TIP = "Offline — reconnect to make changes";

/** A Button that greys out with an explanation while offline. */
export function WriteButton(props: ButtonProps) {
  const { online } = useApp();
  if (online) return <Button {...props} />;
  return (
    <Tooltip title={OFFLINE_TIP}>
      <Button {...props} disabled />
    </Tooltip>
  );
}

/** localStorage, wrapped: it can throw or be empty in private windows. */
export const local = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* per-viewer convenience only; ignore */
    }
  },
};
