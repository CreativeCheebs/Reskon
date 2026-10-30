import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, Segmented, Spin, Tabs } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { palette } from "../theme/palette";
import type { ViewIcon } from "../types";
import { IconGlyph } from "./ViewIconMark";

// Emoji plus two open-source icon sets (both MIT): Microsoft's Fluent UI
// System Icons (24px, regular and filled) and PrimeIcons. The data is built
// from npm packages by scripts/icons.mjs and fetched the first time the
// picker opens; the chosen icon's SVG is then stored on the view itself.

type SvgSet = { size: number; icons: [string, string][] };
type EmojiRow = [string, string, string]; // char, name, group

const URLS = {
  emoji: new URL("./generated/emoji.json", import.meta.url).href,
  "fluent-regular": new URL("./generated/fluent-regular.json", import.meta.url).href,
  "fluent-filled": new URL("./generated/fluent-filled.json", import.meta.url).href,
  prime: new URL("./generated/prime.json", import.meta.url).href,
};
type SetId = keyof typeof URLS;

const cache = new Map<SetId, Promise<unknown>>();
function load<T>(id: SetId): Promise<T> {
  if (!cache.has(id))
    cache.set(
      id,
      fetch(URLS[id]).then((r) => {
        if (!r.ok) throw new Error(`Could not load icons (${r.status})`);
        return r.json();
      }),
    );
  return cache.get(id) as Promise<T>;
}

function useSet<T>(id: SetId): { data?: T; error?: string } {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    setState({});
    load<T>(id).then(
      (data) => live && setState({ data }),
      (e) => {
        cache.delete(id);
        if (live) setState({ error: (e as Error).message });
      },
    );
    return () => {
      live = false;
    };
  }, [id]);
  return state;
}

const LIMIT = 360; // cells drawn at once; search narrows the rest

const matches = (words: string[], text: string) => words.every((w) => text.includes(w));

export function IconPicker({ value, color, onChange }: { value: ViewIcon; color: string | null; onChange: (icon: ViewIcon) => void }) {
  const [tab, setTab] = useState<"emoji" | "fluent" | "prime">(value.set === "prime" ? "prime" : value.set?.startsWith("fluent") ? "fluent" : "emoji");
  const [fluentStyle, setFluentStyle] = useState<"fluent-regular" | "fluent-filled">(
    value.set === "fluent-filled" ? "fluent-filled" : "fluent-regular",
  );
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  return (
    <div style={{ width: 380 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <Input
          size="small"
          autoFocus
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search icons and emoji"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button size="small" onClick={() => onChange({})} disabled={!value.emoji && !value.svg}>
          No icon
        </Button>
      </div>
      <Tabs
        size="small"
        activeKey={tab}
        onChange={(k) => setTab(k as typeof tab)}
        tabBarExtraContent={
          tab === "fluent" && (
            <Segmented
              size="small"
              value={fluentStyle}
              onChange={(v) => setFluentStyle(v as typeof fluentStyle)}
              options={[
                { value: "fluent-regular", label: "Regular" },
                { value: "fluent-filled", label: "Filled" },
              ]}
            />
          )
        }
        items={[
          { key: "emoji", label: "Emoji", children: <EmojiGrid words={words} value={value} onPick={onChange} /> },
          {
            key: "fluent",
            label: "Fluent",
            children: <SvgGrid set={fluentStyle} words={words} value={value} color={color} onPick={onChange} />,
          },
          { key: "prime", label: "PrimeIcons", children: <SvgGrid set="prime" words={words} value={value} color={color} onPick={onChange} /> },
        ]}
      />
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, 34px)",
  gap: 2,
  height: 260,
  overflowY: "auto",
  alignContent: "start",
};

function Cell({ selected, title, onClick, children }: { selected: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px solid ${selected ? palette.accent : "transparent"}`,
        borderRadius: 6,
        background: selected ? palette.selected : "transparent",
        color: palette.fg,
        cursor: "pointer",
        padding: 0,
      }}
      onMouseEnter={(e) => !selected && (e.currentTarget.style.background = palette.hover)}
      onMouseLeave={(e) => !selected && (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function Status({ error, shown, total }: { error?: string; shown?: number; total?: number }) {
  if (error) return <div style={{ color: palette.danger, fontSize: 12 }}>{error}</div>;
  if (shown === undefined) return <Spin size="small" />;
  if (shown === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing matches" />;
  return (
    <div style={{ color: palette.subtle, fontSize: 11, marginTop: 4 }}>
      {total! > shown ? `Showing ${shown} of ${total}. Type to narrow.` : `${total} icons`}
    </div>
  );
}

function EmojiGrid({ words, value, onPick }: { words: string[]; value: ViewIcon; onPick: (i: ViewIcon) => void }) {
  const { data, error } = useSet<EmojiRow[]>("emoji");
  const hits = useMemo(() => (data ?? []).filter(([, name, group]) => matches(words, `${name} ${group}`.toLowerCase())), [data, words.join(" ")]);
  return (
    <>
      {data && (
        <div style={gridStyle}>
          {hits.slice(0, LIMIT * 2).map(([char, name]) => (
            <Cell key={char} title={name} selected={value.emoji === char} onClick={() => onPick({ emoji: char })}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{char}</span>
            </Cell>
          ))}
        </div>
      )}
      <Status error={error} shown={data ? Math.min(hits.length, LIMIT * 2) : undefined} total={hits.length} />
    </>
  );
}

function SvgGrid({
  set,
  words,
  value,
  color,
  onPick,
}: {
  set: SetId;
  words: string[];
  value: ViewIcon;
  color: string | null;
  onPick: (i: ViewIcon) => void;
}) {
  const { data, error } = useSet<SvgSet>(set);
  const hits = useMemo(() => (data?.icons ?? []).filter(([name]) => matches(words, name.replace(/-/g, " "))), [data, words.join(" ")]);
  return (
    <>
      {data && (
        <div style={gridStyle}>
          {hits.slice(0, LIMIT).map(([name, body]) => (
            <Cell
              key={name}
              title={name.replace(/-/g, " ")}
              selected={value.set === set && value.name === name}
              onClick={() => onPick({ set, name, svg: body })}
            >
              <IconGlyph icon={{ svg: body }} color={color ?? palette.fg} size={20} />
            </Cell>
          ))}
        </div>
      )}
      <Status error={error} shown={data ? Math.min(hits.length, LIMIT) : undefined} total={hits.length} />
    </>
  );
}
