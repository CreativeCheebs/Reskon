import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../store";
import type { StateRow } from "../day/types";
import { StateChip } from "./severity";

// The buffs and debuffs in force, along the top of every screen except the
// dashboard (which has a Buffs and debuffs widget instead), so they are seen
// without opening anything. Hidden when nothing is in force.
// Reloads when states change (STATES_CHANGED) and on reconnect.

export const STATES_CHANGED = "jb-states-changed";

/** The states in force, worst first. Shared by the bar and the dashboard's
 *  Buffs and debuffs widget, so both reload on the same events. */
export function useInForce(): StateRow[] {
  const { reloadKey } = useApp();
  const [states, setStates] = useState<StateRow[]>([]);
  const load = useCallback(() => {
    api
      .get<StateRow[]>("/states")
      .then((all) => setStates(all.filter((s) => s.in_force).sort((a, b) => b.effective_severity - a.effective_severity)))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(STATES_CHANGED, load);
    return () => window.removeEventListener(STATES_CHANGED, load);
  }, [load, reloadKey]);
  return states;
}

export function InForceBar({ onOpen }: { onOpen: () => void }) {
  const states = useInForce();
  if (states.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
      {states.map((s) => (
        <StateChip key={s.id} s={s} onClick={onOpen} />
      ))}
    </div>
  );
}
