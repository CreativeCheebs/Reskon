import { useState } from "react";
import { Button, Input, Typography } from "antd";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { DEFAULT_TERMS, MAX_TERM_LENGTH, termWords } from "../terms";

// The `terms` setting: what the screens call tasks and epics. One setting on
// the account, so the phone uses the same words. Only what is shown changes.
// Only words that differ from the default are stored. Saves when a box is left.

const FIELDS = [
  { key: "task", label: "One task" },
  { key: "tasks", label: "Several tasks" },
  { key: "epic", label: "One epic" },
  { key: "epics", label: "Several epics" },
] as const;

type Key = (typeof FIELDS)[number]["key"];

export function NamesSettings() {
  const { boot, saveSetting, online } = useApp();
  const saved = termWords(boot.settings);
  const [draft, setDraft] = useState<Record<Key, string>>(saved);

  const save = (next: Record<Key, string>) => {
    const words = {} as Record<Key, string>;
    for (const f of FIELDS) words[f.key] = next[f.key].trim() || DEFAULT_TERMS[f.key];
    const changed: Partial<Record<Key, string>> = {};
    for (const f of FIELDS) if (words[f.key] !== DEFAULT_TERMS[f.key]) changed[f.key] = words[f.key];
    setDraft(words);
    // A refused word (the toast says why) stays in its box so it can be fixed, not retyped.
    autosave(saveSetting("terms", changed)).catch(() => undefined);
  };
  const isDefault = FIELDS.every((f) => saved[f.key] === DEFAULT_TERMS[f.key]);

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {FIELDS.map((f) => (
          <label key={f.key} style={{ display: "block" }}>
            <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
              {f.label}
            </Typography.Text>
            <Input
              value={draft[f.key]}
              disabled={!online}
              maxLength={MAX_TERM_LENGTH}
              placeholder={DEFAULT_TERMS[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              onBlur={() => draft[f.key] !== saved[f.key] && save(draft)}
              onPressEnter={(e) => e.currentTarget.blur()}
            />
          </label>
        ))}
      </div>
      <Typography.Paragraph style={{ color: palette.muted, fontSize: 13, margin: "12px 0 8px" }}>
        Write each word in lower case, like <em>todo</em> and <em>todos</em>, and set both the one and the several. It is capitalised where a sentence or label starts. Letters, digits, spaces, hyphens and apostrophes only, up to 24. Only what you see changes; nothing is renamed in your data.
      </Typography.Paragraph>
      <Button disabled={!online || isDefault} onClick={() => save({ ...DEFAULT_TERMS })}>
        Use task and epic again
      </Button>
    </div>
  );
}
