import { useState } from "react";
import { DatePicker, Modal } from "antd";
import { type Dayjs } from "dayjs";
import { api } from "../api";
import { message } from "../theme/feedback";
import type { DayItem } from "./types";

/**
 * Move a line to another day. No day is chosen to begin with. Enter in the
 * picker (once its calendar is closed) moves it. The line keeps its sessions;
 * a task already on that day is refused by the server. A task line gets a new
 * line id, so the caller reads the day again.
 */
export function RescheduleModal({ item, onDone, onClose }: { item: DayItem; onDone: () => void; onClose: () => void }) {
  const [to, setTo] = useState<Dayjs | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!to && to.format("YYYY-MM-DD") !== item.day;
  const save = async () => {
    if (!to || !ready || busy) return;
    setBusy(true);
    try {
      await api.patch(`/day-items/${item.id}`, { day: to.format("YYYY-MM-DD") });
      onDone();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal open centered width={360} title={`Reschedule “${item.title}”`} okText="Move" onOk={save} onCancel={onClose} okButtonProps={{ disabled: !ready, loading: busy }}>
      <label htmlFor="resched-date" style={{ display: "block", marginBottom: 6 }}>
        New day
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!calendarOpen) void save();
        }}
      >
        <DatePicker id="resched-date" autoFocus allowClear={false} value={to} placeholder="Pick a day" format="ddd D MMM YYYY" onChange={setTo} onOpenChange={setCalendarOpen} style={{ width: "100%" }} />
      </form>
    </Modal>
  );
}
