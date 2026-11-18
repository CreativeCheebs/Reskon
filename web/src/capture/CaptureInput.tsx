import { useEffect, useRef, useState } from "react";
import { AutoComplete, Input, Tag, type InputRef } from "antd";
import { api } from "../api";
import { useTerms } from "../terms";

// The Quick capture line, with suggestions underneath as you type: lines
// typed into Quick capture before and the titles of tasks that match
// (GET /api/capture/suggest). Up/Down moves, Enter picks the highlighted
// one and only fills the box; Enter with nothing highlighted reads the line
// as before. Nothing is written by asking.

export interface CaptureSuggestion {
  text: string;
  kind: "task" | "session" | "history";
  task_id?: number;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 150;
// Ant Design lights up the first option that begins with what was typed, so Enter would pick it without an arrow key. A hidden
// leading character on each option value stops that: only a row the person moves to (or clicks) is picked.
const HIDE = "​";

/** Suggestions for text, asked a moment after typing stops. An older
 *  answer never replaces a newer one, and a failed request offers nothing. */
export function useCaptureSuggestions(text: string, enabled: boolean): CaptureSuggestion[] {
  const [list, setList] = useState<CaptureSuggestion[]>([]);
  const seq = useRef(0);
  const q = text.trim();
  const active = enabled && q.length >= MIN_CHARS;
  useEffect(() => {
    const mine = ++seq.current;
    if (!active) {
      setList([]);
      return;
    }
    const t = window.setTimeout(() => {
      api
        .get<CaptureSuggestion[]>(`/capture/suggest?${new URLSearchParams({ q })}`)
        .then((r) => mine === seq.current && setList(Array.isArray(r) ? r : []))
        .catch(() => mine === seq.current && setList([]));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [active, q]);
  return active ? list : [];
}

interface Props {
  text: string;
  onText: (t: string) => void;
  /** Enter with no suggestion picked: read the line. */
  onEnter: () => void;
  /** A suggestion was picked; the box already holds its text. */
  onPick: (s: CaptureSuggestion) => void;
  disabled?: boolean;
  inputRef?: React.Ref<InputRef>;
  onFocus?: () => void;
}

export function CaptureInput({ text, onText, onEnter, onPick, disabled, inputRef, onFocus }: Props) {
  const T = useTerms();
  const suggestions = useCaptureSuggestions(text, !disabled);
  // Enter that picks a suggestion also reaches the input's own Enter
  // handler; this flag tells that one to stand down.
  const picking = useRef(false);

  const kindLabel = (k: CaptureSuggestion["kind"]) => (k === "task" ? T.Task : k === "session" ? "Session" : "Before");
  const options = suggestions.map((s) => ({
    value: HIDE + s.text,
    item: s,
    label: (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.text}</span>
        <Tag bordered={false} style={{ margin: 0, fontSize: 11 }}>
          {kindLabel(s.kind)}
        </Tag>
      </div>
    ),
  }));

  return (
    <AutoComplete
      style={{ width: "100%" }}
      value={text}
      options={options}
      defaultActiveFirstOption={false}
      virtual={false}
      backfill={false}
      onChange={(v) => onText(v.split(HIDE).join(""))}
      onSelect={(_v, opt) => {
        picking.current = true;
        window.setTimeout(() => (picking.current = false), 100);
        onPick((opt as unknown as { item: CaptureSuggestion }).item);
      }}
    >
      <Input
        ref={inputRef}
        data-capture-input
        autoFocus
        size="large"
        placeholder="Worked on stm32 demo, 2 hours · Need to order a replacement NVR drive"
        disabled={disabled}
        onPressEnter={() => window.setTimeout(() => !picking.current && onEnter(), 0)}
        onFocus={onFocus}
      />
    </AutoComplete>
  );
}
