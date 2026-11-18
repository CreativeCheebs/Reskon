import { Button, Modal } from "antd";
import { SessionModal } from "../sessions/SessionModal";
import type { DayItem, TimerRow } from "./types";
import type { OpenDraft } from "./useTimers";

/**
 * The timer's dialogs: the session form for a stopped timer, the notice when a
 * start is refused because a timer already runs, and the offer to start the
 * wanted timer once the review is over.
 */
export function TimerDialogs({
  draft,
  onSaved,
  onFinish,
  blocked,
  onStopBlocking,
  onCloseBlocked,
  offer,
  onStartOffer,
  onCloseOffer,
}: {
  draft: OpenDraft | null;
  onSaved: () => void;
  /** The review ended: the form was saved or cancelled. */
  onFinish: () => void;
  blocked: TimerRow[] | null;
  onStopBlocking: (t: TimerRow) => void;
  onCloseBlocked: () => void;
  offer: DayItem | null;
  onStartOffer: (item: DayItem) => void;
  onCloseOffer: () => void;
}) {
  return (
    <>
      {draft && <SessionModal initial={draft.initial} extra={draft.extra} onSaved={onSaved} onClose={onFinish} />}
      <Modal open={blocked !== null} centered title="A timer is already running" footer={null} onCancel={onCloseBlocked}>
        <p>Only one timer runs at a time. Stop the running one first (you will review its session before it is saved), then start the new one.</p>
        <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {(blocked ?? []).map((t) => (
            <li key={t.id} style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>{t.title}</span>
              <Button type="primary" size="small" onClick={() => onStopBlocking(t)} aria-label={`Stop the timer on ${t.title} and review`}>
                Stop it and review
              </Button>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal open={offer !== null} centered title="Start the timer now?" okText="Start timer" onOk={() => {
          const item = offer;
          onCloseOffer();
          if (item) onStartOffer(item);
        }} onCancel={onCloseOffer}>
        <p>You wanted to start a timer on “{offer?.title}”. Start it now?</p>
      </Modal>
    </>
  );
}
