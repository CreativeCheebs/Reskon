import { Alert, Button } from "antd";

/**
 * A failed load, with a way to try again. `stale` means older data is still
 * on screen underneath, so the message says it may be out of date instead of
 * replacing the screen.
 */
export function LoadError({ message, onRetry, stale = false }: { message: string; onRetry: () => void; stale?: boolean }) {
  return (
    <Alert
      type={stale ? "warning" : "error"}
      showIcon
      message={stale ? "Could not refresh. What you see may be out of date." : "Could not load this."}
      description={message}
      style={stale ? { marginBottom: 8 } : undefined}
      action={
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
