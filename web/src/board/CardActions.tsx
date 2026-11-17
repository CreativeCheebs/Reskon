import { forwardRef, useState, type ReactNode } from "react";
import { Button, Dropdown, Input, Modal, Popover, Space, Tooltip, type MenuProps } from "antd";
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EllipsisOutlined,
  ExpandAltOutlined,
  FileTextOutlined,
  MoonOutlined,
  SwapRightOutlined,
} from "@ant-design/icons";
import { message } from "../theme/feedback";
import { api, patchWithRetry } from "../api";
import { useApp } from "../store";
import { today } from "../format";
import { SessionModal } from "../sessions/SessionModal";
import { deleteTaskAsking } from "../task/deleteTask";
import { snoozeTask } from "../task/SnoozeButton";
import { snoozeIntervals } from "../task/snoozeIntervals";
import { daysFromToday, SnoozeHead, SnoozeRowBody, useSnoozeForecast } from "../task/SnoozeForecast";
import type { Task } from "../types";
import { makeTerms, termWords, useTerms, type Terms } from "../terms";

// A board card's quick actions. Which ones sit in the hover rail over the
// card's upper right corner, and which the right-click menu lists, is the
// `card_actions` setting (Settings → Card actions); by default the rail
// holds Log time and Snooze. More always holds the actions not in the rail.
// The rail shows on hover, keyboard focus and while one of its menus is
// open. Touch screens have no hover, so there the rail is just More, always
// shown, holding every action (see interactionStyles). Every change goes
// through the usual endpoints.

export type CardActionKey = "log" | "snooze" | "note" | "move" | "open" | "delete";

/** Every card action, in the order they are shown everywhere. */
export const cardActionsFor = (T: Terms): { key: CardActionKey; label: string; hint: string; icon: ReactNode }[] => [
  { key: "log", label: "Log time", hint: `Open the worklog form with this ${T.task} filled in`, icon: <ClockCircleOutlined /> },
  { key: "snooze", label: "Snooze", hint: `Hide this open ${T.task} for some days`, icon: <MoonOutlined /> },
  { key: "note", label: "Edit description", hint: `Edit the ${T.task}'s description in place`, icon: <FileTextOutlined /> },
  { key: "move", label: "Move to", hint: "Send the card to another status", icon: <SwapRightOutlined /> },
  { key: "open", label: `Open ${T.task}`, hint: `Open the ${T.task} panel`, icon: <ExpandAltOutlined /> },
  { key: "delete", label: "Delete", hint: `Delete the ${T.task}, after asking`, icon: <DeleteOutlined /> },
];

/** The actions with the default words: enough for their keys. */
export const CARD_ACTIONS = cardActionsFor(makeTerms(termWords({})));

/** Most buttons the rail may hold, so it never covers a whole title. */
export const RAIL_MAX = 3;

export interface CardActionConfig {
  rail: CardActionKey[];
  menu: CardActionKey[];
}

export const DEFAULT_CARD_ACTIONS: CardActionConfig = { rail: ["log", "snooze"], menu: CARD_ACTIONS.map((a) => a.key) };

/** The `card_actions` setting, known keys only, in catalogue order. */
export function cardActionsOf(settings: Record<string, unknown>): CardActionConfig {
  const saved = settings.card_actions as Partial<CardActionConfig> | undefined;
  const pick = (keys: unknown, fallback: CardActionKey[]) =>
    Array.isArray(keys) ? CARD_ACTIONS.map((a) => a.key).filter((k) => keys.includes(k)) : fallback;
  return { rail: pick(saved?.rail, DEFAULT_CARD_ACTIONS.rail).slice(0, RAIL_MAX), menu: pick(saved?.menu, DEFAULT_CARD_ACTIONS.menu) };
}

export interface CardHandlers {
  onOpen: (id: number) => void;
  onChanged: (t: Task) => void;
  onDeleted: (id: number) => void;
}

const touch = () => typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;

type Item = NonNullable<MenuProps["items"]>[number];

/** The card's action state (note editor, log form, menus) and its menus. */
export function useCardActions(task: Task, { onOpen, onChanged, onDeleted }: CardHandlers) {
  const T = useTerms();
  const app = useApp();
  const [noteOpen, setNoteOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [railMenu, setRailMenu] = useState<string | null>(null); // which rail dropdown is open
  const [contextOpen, setContextOpen] = useState(false);
  const config = cardActionsOf(app.boot.settings);
  const open = task.behaviour === "todo" || task.behaviour === "in_progress";
  // Snooze is for open tasks only; the others always apply.
  const applies = (k: CardActionKey) => k !== "snooze" || open;

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const move = (statusId: number) =>
    run(async () => {
      const { column_renumbered: _, ...t } = await api.post<Task & { column_renumbered?: boolean }>(`/tasks/${task.id}/move`, {
        status_id: statusId,
        today: today(),
      });
      onChanged(t);
    });
  const snooze = (days: number) =>
    run(async () => {
      onChanged(await snoozeTask(task.id, days));
      message.success(`Snoozed for ${days === 1 ? "a day" : `${days} days`}`);
    });
  const remove = () => deleteTaskAsking(task, onDeleted, (e) => message.error(e.message), T);
  // Logging time changes the card's logged hours and time bar.
  const reload = () => run(async () => onChanged(await api.get<Task>(`/tasks/${task.id}`)));

  const intervals = snoozeIntervals(app.boot.settings);
  // The snooze choices show what is already coming back each day; asked of
  // the server when a menu that holds them opens.
  const forecast = useSnoozeForecast(
    intervals.map(daysFromToday),
    task.id,
    open && (railMenu === "snooze" || railMenu === "more" || contextOpen),
  );
  const statuses = [...app.boot.statuses].sort((a, b) => a.position - b.position);
  // The choices under Move to and Snooze, as a submenu or a rail dropdown.
  const choices: Record<"move" | "snooze", Item[]> = {
    move: statuses.map((s) => ({
      key: `move:${s.id}`,
      label: s.name,
      icon: <span className="jb-menu-dot" style={/^#[0-9a-fA-F]{6}$/.test(s.color ?? "") ? { background: s.color! } : undefined} />,
      disabled: s.id === task.status_id,
      extra: s.id === task.status_id ? "Now" : undefined,
    })),
    snooze: intervals.length === 0 ? [] : [
      {
        type: "group",
        key: "snooze-head",
        label: <SnoozeHead />,
        children: intervals.map((n) => ({ key: `snooze:${n}`, label: <SnoozeRowBody days={n} state={forecast} /> })),
      },
    ],
  };
  const item = (k: CardActionKey): Item => {
    const a = cardActionsFor(T).find((x) => x.key === k)!;
    const offline = !app.online && k !== "open";
    if (k === "move" || k === "snooze")
      return { key: k, label: a.label, icon: a.icon, disabled: offline, children: choices[k], popupClassName: "jb-menu" };
    return { key: k, label: a.label, icon: a.icon, disabled: offline, danger: k === "delete" };
  };
  // Delete sits apart, after a divider.
  const list = (keys: CardActionKey[]): Item[] => {
    const ks = keys.filter(applies);
    const main = ks.filter((k) => k !== "delete").map(item);
    return ks.includes("delete") ? [...main, ...(main.length ? [{ type: "divider" as const }] : []), item("delete")] : main;
  };

  const onClick: MenuProps["onClick"] = ({ key, domEvent }) => {
    domEvent.stopPropagation();
    setRailMenu(null);
    setContextOpen(false);
    const [what, arg] = key.split(":");
    if (what === "open") onOpen(task.id);
    else if (what === "note") setNoteOpen(true);
    else if (what === "log") setLogging(true);
    else if (what === "move") move(Number(arg));
    else if (what === "snooze") snooze(Number(arg));
    else if (what === "delete") remove();
  };

  const all = CARD_ACTIONS.map((a) => a.key);
  const rail = config.rail.filter(applies);
  const more = touch() ? all : all.filter((k) => !rail.includes(k));

  return {
    task,
    noteOpen,
    setNoteOpen,
    logging,
    setLogging,
    railMenu,
    setRailMenu,
    contextOpen,
    setContextOpen,
    /** The rail shows while any of its parts is open. */
    pinned: noteOpen || railMenu !== null || contextOpen,
    rail,
    noteOnRail: rail.includes("note") && !touch(),
    onClick,
    choices,
    run: { open: () => onOpen(task.id), log: () => setLogging(true), delete: remove },
    moreMenu: { items: list(more), onClick },
    /** Empty when the setting turns every item off: the browser's own menu then. */
    contextMenu: { items: list(config.menu), onClick },
    reload,
  };
}

type Actions = ReturnType<typeof useCardActions>;

/** The right-click menu: the card's title, then the chosen actions, on a
 *  panel with the card's own corners. With nothing chosen, the browser's
 *  own menu shows instead. */
export function CardContextMenu({ actions, children }: { actions: Actions; children: React.ReactElement }) {
  if (!actions.contextMenu.items.length) return children;
  return (
    <Dropdown
      trigger={["contextMenu"]}
      rootClassName="jb-menu"
      menu={actions.contextMenu}
      open={actions.contextOpen}
      onOpenChange={actions.setContextOpen}
      popupRender={(menu) => (
        <div className="jb-menu-panel">
          <div className="jb-menu-head" title={actions.task.title}>
            {actions.task.title}
          </div>
          {menu}
        </div>
      )}
    >
      {children}
    </Dropdown>
  );
}

/** The rail itself, placed in the card by TaskCard. Its events stop here,
 *  so a click is never also a card click, a drag or a keyboard pick-up. */
export function CardActionRail({ task, actions, onChanged }: { task: Task; actions: Actions; onChanged: (t: Task) => void }) {
  const T = useTerms();
  const { online } = useApp();
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const note = <NoteEditor task={task} onSaved={onChanged} onClose={() => actions.setNoteOpen(false)} />;
  // A dropdown on the rail; only one is open at a time.
  const dropdown = (key: string, items: MenuProps["items"], button: React.ReactElement) => (
    <Dropdown
      key={key}
      trigger={["click"]}
      rootClassName="jb-menu"
      menu={{ items, onClick: actions.onClick }}
      open={actions.railMenu === key}
      onOpenChange={(v) => actions.setRailMenu(v ? key : null)}
      placement="bottomRight"
    >
      {button}
    </Dropdown>
  );

  const buttons = actions.rail.map((k) => {
    const a = cardActionsFor(T).find((x) => x.key === k)!;
    const offline = !online && k !== "open";
    const button = (props: React.ButtonHTMLAttributes<HTMLButtonElement> = {}) => (
      <RailButton key={k} label={a.label} primary danger={k === "delete"} disabled={offline} {...props}>
        {a.icon}
      </RailButton>
    );
    if (k === "move" || k === "snooze") return dropdown(k, actions.choices[k], button());
    if (k === "note")
      return (
        <Popover
          key={k}
          trigger="click"
          open={actions.noteOpen && actions.noteOnRail}
          onOpenChange={(v) => online && actions.setNoteOpen(v)}
          placement="bottomRight"
          title="Edit description"
          destroyOnHidden
          content={note}
        >
          {button()}
        </Popover>
      );
    return button({ onClick: actions.run[k] });
  });

  return (
    <div className="jb-card-rail" role="toolbar" aria-label="Card actions" onClick={stop} onPointerDown={stop} onKeyDown={stop} onContextMenu={stop}>
      {/* Note chosen from a menu, with no Note button to open beside: a dialog. */}
      {actions.noteOpen && !actions.noteOnRail && (
        <Modal open title="Edit description" footer={null} width={360} onCancel={() => actions.setNoteOpen(false)} destroyOnHidden>
          {note}
        </Modal>
      )}
      {buttons}
      {actions.moreMenu.items.length > 0 &&
        dropdown(
          "more",
          actions.moreMenu.items,
          <RailButton label="More actions" tip="More">
            <EllipsisOutlined />
          </RailButton>,
        )}
      {actions.logging && (
        <SessionModal
          initial={{ task_id: task.id, area_id: task.area_id }}
          onClose={() => actions.setLogging(false)}
          onSaved={() => actions.reload()}
        />
      )}
    </div>
  );
}

/** A small square button with its name as a tooltip on hover and focus.
 *  Extra props (onClick, aria-expanded ...) come from the Popover or
 *  Dropdown wrapped round it. */
export const RailButton = forwardRef<
  HTMLButtonElement,
  { label: string; tip?: string; primary?: boolean; danger?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function RailButton({ label, tip, primary, danger, children, className, ...rest }, ref) {
  return (
    <Tooltip title={tip ?? label} placement="top" trigger={["hover", "focus"]} mouseEnterDelay={0.2}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={["jb-rail-btn", primary && "jb-rail-primary", danger && "jb-rail-danger", className].filter(Boolean).join(" ")}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});

/** The task's description, edited in place. Saves with the updated_at the
 *  card last saw, retrying once on a conflict like the task panel does. */
export function NoteEditor({ task, onSaved, onClose }: { task: Task; onSaved: (t: Task) => void; onClose: () => void }) {
  const [text, setText] = useState(task.description ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (text === (task.description ?? "")) return onClose();
    setBusy(true);
    try {
      onSaved(await patchWithRetry<Task>(`/tasks/${task.id}`, task.updated_at, { description: text }));
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Space direction="vertical" size={8} style={{ width: "min(300px, 80vw)" }}>
      <Input.TextArea
        autoFocus
        autoSize={{ minRows: 4, maxRows: 12 }}
        placeholder="Add a note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") onClose();
        }}
      />
      <Space style={{ width: "100%", justifyContent: "flex-end" }}>
        <Button size="small" onClick={onClose}>
          Cancel
        </Button>
        <Button size="small" type="primary" loading={busy} onClick={save}>
          Save
        </Button>
      </Space>
    </Space>
  );
}
