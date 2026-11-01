import { useState } from "react";
import { Checkbox, Tooltip, Typography } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { blend, palette } from "../theme/palette";
import { CARD_ACTIONS, RAIL_MAX, cardActionsOf, type CardActionConfig, type CardActionKey } from "../board/CardActions";

// The `card_actions` setting: which actions are buttons on a board card
// (shown on hover) and which the card's right-click menu lists. Actions
// that are not buttons stay under the card's More button. Saves on change.

export function CardActionSettings() {
  const { boot, saveSetting, online } = useApp();
  const [config, setConfig] = useState<CardActionConfig>(cardActionsOf(boot.settings));

  const toggle = (list: "rail" | "menu", key: CardActionKey, on: boolean) => {
    const before = config;
    const keys = on ? [...config[list], key] : config[list].filter((k) => k !== key);
    // Keep catalogue order, whatever order they were ticked in.
    const after = { ...config, [list]: CARD_ACTIONS.map((a) => a.key).filter((k) => keys.includes(k)) };
    setConfig(after);
    autosave(saveSetting("card_actions", after)).catch(() => setConfig(before));
  };
  const railFull = config.rail.length >= RAIL_MAX;
  const cell = { display: "flex", justifyContent: "center", alignItems: "center" } as const;
  const line = `1px solid ${palette.border}`;

  return (
    <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* What a hovered card shows, from the current choice. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, width: 110 }}>
          On a hovered card
        </Typography.Text>
        <div
          style={{
            display: "flex",
            gap: 3,
            padding: 2,
            borderRadius: 8,
            background: blend(palette.hover, palette.panel, 0.75),
            border: line,
          }}
          aria-hidden
        >
          {config.rail.map((k) => {
            const a = CARD_ACTIONS.find((x) => x.key === k)!;
            return (
              <Tooltip key={k} title={a.label}>
                <span className="jb-rail-btn">{a.icon}</span>
              </Tooltip>
            );
          })}
          <Tooltip title="More: every other action">
            <span className="jb-rail-btn">
              <EllipsisOutlined />
            </span>
          </Tooltip>
        </div>
      </div>

      <div role="table" aria-label="Card actions" style={{ border: line, borderRadius: 8, overflow: "hidden" }}>
        <div
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 96px 96px",
            padding: "8px 12px",
            background: palette.panelDim,
            borderBottom: line,
            fontSize: 12,
            fontWeight: 600,
            color: palette.muted,
          }}
        >
          <span role="columnheader">Action</span>
          <span role="columnheader" style={cell}>
            Button
          </span>
          <span role="columnheader" style={cell}>
            Right-click
          </span>
        </div>
        {CARD_ACTIONS.map((a, i) => {
          const onRail = config.rail.includes(a.key);
          return (
            <div
              role="row"
              key={a.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 96px 96px",
                alignItems: "center",
                padding: "8px 12px",
                borderTop: i ? line : undefined,
              }}
            >
              <span role="cell" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span className="jb-rail-btn" style={{ cursor: "default", flex: "none" }} aria-hidden>
                  {a.icon}
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: a.key === "delete" ? palette.danger : palette.fg }}>{a.label}</span>
                  <span style={{ fontSize: 12, color: palette.subtle }}>{a.hint}</span>
                </span>
              </span>
              <span role="cell" style={cell}>
                <Tooltip title={!onRail && railFull ? `Up to ${RAIL_MAX} buttons; the rest stay under More` : undefined}>
                  <Checkbox
                    aria-label={`${a.label} as a button`}
                    checked={onRail}
                    disabled={!online || (!onRail && railFull)}
                    onChange={(e) => toggle("rail", a.key, e.target.checked)}
                  />
                </Tooltip>
              </span>
              <span role="cell" style={cell}>
                <Checkbox
                  aria-label={`${a.label} in the right-click menu`}
                  checked={config.menu.includes(a.key)}
                  disabled={!online}
                  onChange={(e) => toggle("menu", a.key, e.target.checked)}
                />
              </span>
            </div>
          );
        })}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Snooze shows only on open tasks. With nothing ticked under Right-click, the browser's own menu opens instead.
      </Typography.Text>
    </div>
  );
}
