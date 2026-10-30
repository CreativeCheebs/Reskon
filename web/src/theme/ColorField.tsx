import { useEffect, useState } from "react";
import { ColorPicker, Tabs } from "antd";
import { palette } from "./palette";
import { SWATCH_SETS, type SwatchSet } from "./swatches";

// The one colour picker used everywhere: a free picker plus tabs of
// standard sets (PrimeReact's Aura palette, Material Design). Free-picker
// drags report once, when you let go; a swatch reports on click.

const LAST_TAB = "jitterbug.colorTab";

export function ColorField({
  value,
  onChange,
  disabled,
  allowClear,
  size = "small",
}: {
  value: string | null | undefined;
  onChange: (hex: string | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
  size?: "small" | "middle";
}) {
  const [draft, setDraft] = useState(value ?? undefined);
  useEffect(() => setDraft(value ?? undefined), [value]);
  const [tab, setTab] = useState(() => {
    try {
      return window.localStorage.getItem(LAST_TAB) ?? "custom";
    } catch {
      return "custom";
    }
  });
  const pickTab = (k: string) => {
    setTab(k);
    try {
      window.localStorage.setItem(LAST_TAB, k);
    } catch {
      /* per-browser convenience only */
    }
  };
  const pick = (hex: string) => {
    setDraft(hex);
    onChange(hex);
  };

  return (
    <ColorPicker
      size={size}
      disabled={disabled}
      allowClear={allowClear}
      disabledAlpha
      value={draft}
      onChange={(c) => setDraft(c.toHexString())}
      onChangeComplete={(c) => onChange(c.toHexString().toUpperCase())}
      onClear={() => {
        setDraft(undefined);
        onChange(null);
      }}
      panelRender={(panel) => (
        <div style={{ width: 300 }}>
          <Tabs
            size="small"
            activeKey={tab}
            onChange={pickTab}
            items={[
              { key: "custom", label: "Custom", children: panel },
              ...SWATCH_SETS.map((s) => ({
                key: s.id,
                label: s.name,
                children: <SwatchGrid set={s} value={draft} onPick={pick} />,
              })),
            ]}
          />
        </div>
      )}
    />
  );
}

function SwatchGrid({ set, value, onPick }: { set: SwatchSet; value: string | undefined; onPick: (hex: string) => void }) {
  const cur = value?.toUpperCase();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 300, overflowY: "auto" }}>
      {set.rows.map(([name, shades]) => (
        <div key={name} style={{ display: "grid", gridTemplateColumns: `repeat(${shades.length}, 1fr)`, gap: 2 }}>
          {shades.map((hex, i) => (
            <button
              key={hex + i}
              type="button"
              title={`${name} ${set.shades[i]} · ${hex}`}
              onClick={() => onPick(hex)}
              style={{
                height: 18,
                padding: 0,
                cursor: "pointer",
                background: hex,
                borderRadius: 3,
                border: cur === hex ? `2px solid ${palette.fg}` : "1px solid transparent",
                outline: cur === hex ? `1px solid ${palette.bg}` : undefined,
              }}
            />
          ))}
        </div>
      ))}
      <div style={{ color: palette.subtle, fontSize: 11, marginTop: 4 }}>Hover a swatch for its name and shade.</div>
    </div>
  );
}
