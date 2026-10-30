import { DIFFICULTY_LABELS, type Bootstrap, type GroupBy, type Task } from "../types";

// Splits a view's tasks into groups (board swimlanes / table sections).
// Grouping only arranges server-provided rows; nothing is derived here.

export const GROUP_OPTIONS: { value: GroupBy; label: string; boardOnly?: boolean; tableOnly?: boolean }[] = [
  { value: "none", label: "No grouping" },
  { value: "epic", label: "Epic" },
  { value: "priority", label: "Priority" },
  { value: "area", label: "Area" },
  { value: "energy_type", label: "Energy type" },
  { value: "difficulty", label: "Intensity" },
  { value: "type", label: "Type" },
  { value: "status", label: "Status", tableOnly: true },
];

export interface Group {
  key: string;
  label: string;
  epic?: Task; // set when grouping by epic
  tasks: Task[];
  /** Fields a task created in this group should get. */
  defaults: Record<string, unknown>;
}

export function groupTasks(tasks: Task[], by: GroupBy, boot: Bootstrap, epics: Map<number, Task>): Group[] {
  if (by === "none") return [{ key: "all", label: "", tasks, defaults: {} }];

  const groups = new Map<string, Group>();
  const order: string[] = [];
  const add = (key: string, label: string, t: Task, defaults: Record<string, unknown>, epic?: Task) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, tasks: [], defaults, epic };
      groups.set(key, g);
      order.push(key);
    }
    g.tasks.push(t);
  };
  const none = (label: string) => `~${label}`; // sorts after real values

  for (const t of tasks) {
    switch (by) {
      case "epic": {
        // An epic sits in its own lane, at the top of its tasks.
        const epicId = t.type === "epic" ? t.id : t.epic_id;
        const epic = epicId ? (t.type === "epic" ? t : epics.get(epicId)) : undefined;
        if (epicId) add(`e${epicId}`, epic?.title ?? `Epic #${epicId}`, t, { epic_id: epicId }, epic);
        else add(none("No epic"), "No epic", t, {});
        break;
      }
      case "priority": {
        const p = boot.priorities.find((x) => x.id === t.priority_id);
        if (p) add(`p${String(p.position).padStart(4, "0")}`, p.name, t, { priority_id: p.id });
        else add(none("No priority"), "No priority", t, {});
        break;
      }
      case "area": {
        const a = boot.areas.find((x) => x.id === t.area_id);
        add(`a${String(a?.position ?? 0).padStart(4, "0")}-${t.area_id}`, a?.name ?? "Unknown area", t, { area_id: t.area_id });
        break;
      }
      case "energy_type": {
        const e = boot.energy_types.find((x) => x.id === t.energy_type_id);
        if (e) add(`x${String(e.position).padStart(4, "0")}`, e.name, t, { energy_type_id: e.id });
        else add(none("No energy type"), "No energy type", t, {});
        break;
      }
      case "difficulty":
        if (t.difficulty)
          add(`d${t.difficulty}`, `Intensity ${t.difficulty} · ${DIFFICULTY_LABELS[t.difficulty] ?? ""}`, t, { difficulty: t.difficulty });
        else add(none("No intensity"), "No intensity", t, {});
        break;
      case "type":
        add(t.type === "epic" ? "0epic" : "1task", t.type === "epic" ? "Epics" : "Tasks", t, { type: t.type });
        break;
      case "status": {
        const s = boot.statuses.find((x) => x.id === t.status_id);
        add(`s${String(s?.position ?? 99).padStart(4, "0")}`, s?.name ?? "Deleted status", t, {});
        break;
      }
    }
  }
  const sortKey = (g: Group) => (by === "epic" && !g.key.startsWith("~") ? g.label.toLowerCase() : g.key);
  return order.map((k) => groups.get(k)!).sort((a, b) => {
    if (a.key.startsWith("~") !== b.key.startsWith("~")) return a.key.startsWith("~") ? 1 : -1;
    return sortKey(a).localeCompare(sortKey(b));
  });
}
