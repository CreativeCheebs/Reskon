import { useState } from "react";
import { DatePicker, Modal } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { api } from "../api";
import { message } from "../theme/feedback";
import type { DayItem } from "./types";

/** Move a line to another day. The line keeps its sessions; a task already on that day is refused by the server. */
export function RescheduleModal({ item, onDone, onClose }: { item: DayItem; onDone: () => void; onClose: () => void }) {
  const [to, setTo] = useState<Dayjs | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!to || busy) return;
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
    <Modal open centered width={360} title={`Reschedule “${item.title}”`} okText="Move" onOk={save} onCancel={onClose} okButtonProps={{ disabled: !to || to.format("YYYY-MM-DD") === item.day, loading: busy }}>
      <label htmlFor="resched-date" style={{ display: "block", marginBottom: 6 }}>
        New day
      </label>
      <DatePicker id="resched-date" autoFocus allowClear={false} value={to ?? dayjs(item.day)} format="ddd D MMM YYYY" onChange={setTo} style={{ width: "100%" }} />
    </Modal>
  );
}
