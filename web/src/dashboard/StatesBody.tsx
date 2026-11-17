import { Button, Empty, Spin } from "antd";
import { StateChip } from "../states/severity";
import { useInForce } from "../states/InForceBar";

// A Buffs and debuffs widget's body: the states in force, worst first, as the
// same chips the top bar used to show. Nothing is saved with the widget; the
// states come from the same call as the Buffs and debuffs screen, and the
// list follows every change to a state by itself. A chip opens that screen
// (not while the dashboard layout is being edited).

export function StatesBody({ editing }: { editing: boolean }) {
  const { states, status, reload } = useInForce();
  if (status === "loading" && states.length === 0)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
        <Spin aria-label="Loading" />
      </div>
    );
  if (status === "failed")
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Couldn't load."
      >
        <Button size="small" onClick={reload}>
          Retry
        </Button>
      </Empty>
    );
  if (states.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing in force." />;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignContent: "flex-start", flex: 1, minHeight: 0, overflow: "auto" }}>
      {states.map((s) => (
        <StateChip key={s.id} s={s} onClick={editing ? undefined : () => (window.location.hash = "#/states")} />
      ))}
    </div>
  );
}
