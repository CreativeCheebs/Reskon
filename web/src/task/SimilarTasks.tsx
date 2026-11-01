import { useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { Lozenge } from "../theme/Lozenge";
import { palette } from "../theme/palette";
import { TypeIcon } from "./TypeIcon";
import type { TaskType } from "../types";

// Duplicate search while a task is typed: the server matches the text
// against every task by words and, with the local model, by meaning
// (GET /api/tasks/similar). Shown under the add-task box, the capture
// line and the view search, so an existing task is found before a copy
// is made. Searching shows three small dots; nothing is written.

export interface SimilarTask {
  id: number;
  key: string;
  title: string;
  type: TaskType;
  status_id: number;
  behaviour: string;
  score: number;
  words: boolean;
  meaning: boolean;
}

interface SimilarResult {
  results: SimilarTask[];
  semantic: "off" | "indexing" | "ready";
  indexed: number;
  total: number;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;

/** Matches for text, refreshed a moment after typing stops. Older answers
 *  never overwrite newer ones. */
export function useSimilarTasks(text: string, { exclude, enabled = true }: { exclude?: number; enabled?: boolean } = {}) {
  const { online } = useApp();
  const [state, setState] = useState<{ loading: boolean; result: SimilarResult | null }>({ loading: false, result: null });
  const seq = useRef(0);
  const q = text.trim();
  const active = enabled && online && q.length >= MIN_CHARS;

  useEffect(() => {
    const mine = ++seq.current;
    if (!active) {
      setState({ loading: false, result: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const t = window.setTimeout(() => {
      const p = new URLSearchParams({ q });
      if (exclude) p.set("exclude", String(exclude));
      api
        .get<SimilarResult>(`/tasks/similar?${p}`)
        .then((result) => mine === seq.current && setState({ loading: false, result }))
        .catch(() => mine === seq.current && setState({ loading: false, result: null }));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q, exclude, active]);

  return { loading: active && state.loading, result: active ? state.result : null };
}

/** Three small pulsing dots: "searching". */
export function LoadingDots({ label = "Searching" }: { label?: string }) {
  return (
    <span className="jb-dots" role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </span>
  );
}

/** The matches as a short list. Renders nothing until there is something
 *  to say: a search under way, or matches. */
export function SimilarTasksList({
  loading,
  result,
  onOpen,
  heading = "Already on your list?",
}: {
  loading: boolean;
  result: SimilarResult | null;
  onOpen?: (id: number) => void;
  heading?: string;
}) {
  const app = useApp();
  const rows = result?.results ?? [];
  if (!loading && rows.length === 0) return null;
  return (
    <div className="jb-similar" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="jb-similar-head">
        <span>{rows.length ? heading : "Looking for similar tasks"}</span>
        {loading && <LoadingDots />}
        {!loading && result?.semantic === "indexing" && (
          <Tooltip title={`Meaning search has read ${result.indexed} of ${result.total} tasks; the rest match by words for now.`}>
            <span className="jb-similar-note">reading tasks…</span>
          </Tooltip>
        )}
      </div>
      {rows.map((t) => {
        const status = app.statusById.get(t.status_id);
        return (
          <button
            key={t.id}
            type="button"
            className="jb-similar-row"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.(t.id);
            }}
            disabled={!onOpen}
            title={onOpen ? "Open this task" : undefined}
          >
            <TypeIcon type={t.type} />
            <span className="jb-similar-title">{t.title}</span>
            <span className="jb-similar-why">{t.words && t.meaning ? "words, meaning" : t.words ? "words" : "meaning"}</span>
            {status && <Lozenge color={status.color}>{status.name}</Lozenge>}
          </button>
        );
      })}
    </div>
  );
}

export const similarStyles = () => `
  .jb-dots { display: inline-flex; gap: 3px; align-items: center; height: 12px; }
  .jb-dots span { width: 4px; height: 4px; border-radius: 2px; background: ${palette.accent}; animation: jb-dot 1s infinite ease-in-out; }
  .jb-dots span:nth-child(2) { animation-delay: .15s; }
  .jb-dots span:nth-child(3) { animation-delay: .3s; }
  @keyframes jb-dot { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
  @media (prefers-reduced-motion: reduce) { .jb-dots span { animation: none; opacity: .7; } }
  .jb-similar { max-height: 260px; overflow-y: auto; margin-top: 6px; border: 1px solid ${palette.border}; border-radius: 8px; background: ${palette.overlay}; padding: 4px; box-shadow: 0 8px 20px ${palette.shadow}40; }
  .jb-similar-head { display: flex; align-items: center; gap: 8px; padding: 3px 6px 4px; font-size: 11px; font-weight: 600; color: ${palette.muted}; }
  .jb-similar-note { font-weight: 400; color: ${palette.subtle}; }
  .jb-similar-row {
    display: flex; align-items: center; gap: 8px; width: 100%; min-height: 28px; padding: 4px 6px; box-sizing: border-box;
    border: none; border-radius: 5px; background: transparent; color: ${palette.fg}; font: inherit; font-size: 12px; text-align: left; cursor: pointer;
  }
  .jb-similar-row:disabled { cursor: default; }
  .jb-similar-row:not(:disabled):hover, .jb-similar-row:focus-visible { background: ${palette.hover}; outline: none; }
  .jb-similar-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .jb-similar-why { flex: none; font-size: 11px; color: ${palette.subtle}; }
`;
