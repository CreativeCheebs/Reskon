import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Switch, Table, Tag, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { palette } from "../theme/palette";
import { severityText, type StateRow } from "../day/types";
import { severityBand } from "./severity";
import { DecaySketch } from "./DecaySketch";
import { StateForm } from "./StateForm";

// Buffs, debuffs and modifiers. Severity now is the decayed value, computed
// by the server for today. Reaching zero never clears a state: it stays
// listed until cleared by hand, and past its duration it reads "ended, not
// cleared" with a one-tap clear. A state never scales any number.

const KIND_COLOR = { debuff: () => palette.epic, buff: () => palette.success, modifier: () => palette.accent };

export function StatesScreen() {
  const { reloadKey } = useApp();
  const [states, setStates] = useState<StateRow[] | null>(null);
  const [shapes, setShapes] = useState<Record<string, number[]>>({});
  const [showCleared, setShowCleared] = useState(false);
  const [form, setForm] = useState<{ editing?: StateRow } | null>(null);

  const load = useCallback(async () => {
    try {
      setStates(await api.get<StateRow[]>("/states"));
    } catch (e) {
      message.error((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, reloadKey]);
  useEffect(() => {
    api.get<Record<string, number[]>>("/states/shapes").then(setShapes).catch(() => undefined);
  }, []);

  // Clearing an ended state dates it to when its duration ran out; anything
  // else is cleared from today. Either can be changed in the form.
  const clear = async (s: StateRow) => {
    const on = s.ended && s.duration_days ? dayjs(s.started_on).add(s.duration_days, "day").format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    try {
      await api.patch(`/states/${s.id}`, { cleared_on: on });
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const remove = async (s: StateRow) => {
    try {
      await api.del(`/states/${s.id}`);
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const rows = (states ?? []).filter((s) => showCleared || !s.cleared_on);
  const hidden = (states ?? []).filter((s) => s.cleared_on).length;
  return (
    <div style={{ maxWidth: 1100, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Buffs &amp; debuffs</h2>
        <span style={{ flex: 1 }} />
        <span style={{ color: palette.muted, fontSize: 12 }}>
          Show cleared{hidden ? ` (${hidden})` : ""} <Switch size="small" checked={showCleared} onChange={setShowCleared} />
        </span>
        <WriteButton type="primary" size="small" icon={<PlusOutlined />} onClick={() => setForm({})}>
          Add
        </WriteButton>
      </div>
      <Table
        size="small"
        loading={!states}
        rowKey="id"
        dataSource={rows}
        pagination={false}
        onRow={(s) => ({ onClick: () => setForm({ editing: s }), style: { cursor: "pointer", opacity: s.cleared_on ? 0.6 : 1 } })}
        locale={{ emptyText: "Nothing in force. Add one when something is in the way, or helping." }}
        columns={[
          { key: "name", title: "Name", render: (_, s) => <span style={{ fontWeight: 600 }}>{s.name}</span> },
          {
            key: "kind",
            title: "Kind",
            width: 90,
            render: (_, s) => <Tag bordered={false} style={{ color: KIND_COLOR[s.kind](), background: `${KIND_COLOR[s.kind]()}22` }}>{s.kind}</Tag>,
          },
          {
            key: "sev",
            title: "Severity now",
            width: 150,
            render: (_, s) => {
              const band = severityBand(s.effective_severity, s.kind);
              return (
                <Tooltip title={band.hint}>
                  {severityText(s)} <span style={{ color: palette.muted }}>· {band.name.toLowerCase()}</span>
                </Tooltip>
              );
            },
          },
          { key: "started", title: "Started", width: 110, render: (_, s) => dayjs(s.started_on).format("D MMM YYYY") },
          {
            key: "days",
            title: "Days running",
            width: 110,
            render: (_, s) => (
              <span>
                {s.days_running ? `day ${s.days_running}` : "not started"}
                {s.duration_days ? <span style={{ color: palette.subtle }}> of {s.duration_days}</span> : null}
              </span>
            ),
          },
          {
            key: "decay",
            title: "Decay",
            width: 130,
            render: (_, s) => (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DecaySketch points={shapes[s.decay]} width={44} height={16} color={KIND_COLOR[s.kind]()} />
                <span style={{ color: palette.muted }}>{s.decay}</span>
              </span>
            ),
          },
          {
            key: "clear",
            title: "",
            width: 200,
            render: (_, s) => (
              <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                {s.cleared_on ? (
                  <span style={{ color: palette.subtle }}>cleared {dayjs(s.cleared_on).format("D MMM")}</span>
                ) : (
                  <>
                    {s.ended && <span style={{ color: palette.muted }}>ended, not cleared</span>}
                    <WriteButton size="small" onClick={() => clear(s)}>
                      Clear
                    </WriteButton>
                  </>
                )}
                {s.cleared_on && (
                  <Popconfirm title="Delete this for good?" description="Clearing keeps its history; deleting removes it." onConfirm={() => remove(s)}>
                    <Button size="small" type="text" danger>
                      Delete
                    </Button>
                  </Popconfirm>
                )}
              </span>
            ),
          },
        ]}
      />
      {form && <StateForm editing={form.editing} shapes={shapes} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  );
}
