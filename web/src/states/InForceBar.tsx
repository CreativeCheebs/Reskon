import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../store";
import type { StateRow } from "../day/types";
import { StateChip } from "./severity";

// The buffs and debuffs in force, along the top of every screen except the
// dashboard (which has a Buffs and debuffs widget instead), so they are seen
// without opening anything. Hidden when nothing is in force.
// Reloads when states change (STATES_CHANGED) and on reconnect.

export const STATES_CHANGED = "jb-states-changed";

export type InForceStatus = "loading" | "ready" | "failed";

/** The states in force, worst first, and whether the list is still loading or
 *  could not be loaded. Shared by the bar and the dashboard's Buffs and
 *  debuffs widget, so both reload on the same events. A late answer to an
 *  older request is ignored. */
export function useInForce(): { states: StateRow[]; status: InForceStatus; reload: () => void } {
  const { reloadKey } = useApp();
  const [states, setStates] = useState<StateRow[]>([]);
  const [status, setStatus] = useState<InForceStatus>("loading");
  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    api
      .get<StateRow[]>("/states")
      .then((all) => {
        if (mine !== seq.current) return;
        setStates(all.filter((s) => s.in_force).sort((a, b) => b.effective_severity - a.effective_severity));
        setStatus("ready");
      })
      .catch(() => {
        if (mine === seq.current) setStatus("failed");
      });
  }, []);
  useEffect(() => {
    const counter = seq;
    load();
    window.addEventListener(STATES_CHANGED, load);
    return () => {
      window.removeEventListener(STATES_CHANGED, load);
      counter.current++; // nothing in flight may set state after this
    };
  }, [load, reloadKey]);
  return { states, status, reload: load };
}

export function InForceBar({ onOpen }: { onOpen: () => void }) {
  const { states } = useInForce();
  if (states.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
      {states.map((s) => (
        <StateChip key={s.id} s={s} onClick={onOpen} />
      ))}
    </div>
  );
}
