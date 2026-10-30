import { useCallback, useEffect, useState } from "react";
import { Button, DatePicker, Spin } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { today } from "../format";
import type { DayData } from "./types";
import { PlanPanel } from "./PlanPanel";
import { Readout } from "./Readout";

// The day screen: a fixed two-panel page, the same every day. Morning is
// the plan (focus, ceilings, what is in force); evening is the readout
// (planned against spent, rest beside it, never netted) and one question
// about the ceiling. Any day can be opened and edited; nothing locks.

export function DayScreen({ date, onDate }: { date?: string; onDate: (d: string) => void }) {
  const { reloadKey } = useApp();
  const day = date ?? today();
  const [data, setData] = useState<DayData | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<DayData>(`/day/${day}`));
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [day]);
  useEffect(() => {
    setData(null);
    load();
  }, [load, reloadKey]);

  const save = async (patch: Record<string, unknown>) => {
    try {
      setData(await api.patch<DayData>(`/day/${day}`, patch));
    } catch (e) {
      message.error((e as Error).message);
      load();
    }
  };

  const shift = (n: number) => onDate(dayjs(day).add(n, "day").format("YYYY-MM-DD"));
  return (
    <div style={{ maxWidth: 1100, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button size="small" icon={<LeftOutlined />} onClick={() => shift(-1)} aria-label="Previous day" />
        <DatePicker size="small" allowClear={false} value={dayjs(day)} format="ddd D MMM YYYY" onChange={(d) => d && onDate(d.format("YYYY-MM-DD"))} />
        <Button size="small" icon={<RightOutlined />} onClick={() => shift(1)} aria-label="Next day" />
        {day !== today() && (
          <Button size="small" type="link" onClick={() => onDate(today())}>
            Today
          </Button>
        )}
      </div>
      {!data ? (
        <Spin style={{ margin: 40 }} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
          <PlanPanel data={data} onSave={save} />
          <Readout data={data} onSave={save} />
        </div>
      )}
    </div>
  );
}
