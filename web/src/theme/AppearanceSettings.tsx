import { useState } from "react";
import { Alert, Button, Popconfirm, Space, Tooltip, Typography, Upload } from "antd";
import { CheckOutlined, DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { confirm, message } from "./feedback";
import { blend, contrast, palette, readable } from "./palette";
import { useTheme } from "./ThemeProvider";
import { BUILTIN_THEMES, checkContrast, parseTheme, themeTemplate, type Theme } from "./themes";

// Pick a theme, download any theme as an editable template, upload your
// own. The choice is saved on the account (setting "theme"); uploaded
// themes are kept in setting "custom_themes".

export function AppearanceSettings() {
  const { boot, online } = useApp();
  const { theme: active, setTheme } = useTheme();
  const [custom, setCustom] = useState<Theme[]>(() =>
    Array.isArray(boot.settings.custom_themes)
      ? (boot.settings.custom_themes as unknown[]).flatMap((t) => parseTheme(JSON.stringify(t)).theme ?? [])
      : [],
  );

  const choose = async (t: Theme) => {
    setTheme(t);
    try {
      await api.put("/settings/theme", t.builtin ? { id: t.id } : { name: t.name, colors: t.colors });
    } catch (e) {
      message.error(`Theme applied here but not saved to your account: ${(e as Error).message}`);
    }
  };

  const saveCustom = async (list: Theme[]) => {
    setCustom(list);
    await api.put("/settings/custom_themes", list.map((t) => ({ name: t.name, colors: t.colors })));
  };

  const upload = async (file: File) => {
    const { theme, errors, warnings } = parseTheme(await file.text());
    if (!theme) {
      confirm({
        title: "That theme file can't be used",
        content: (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ),
        okText: "OK",
        cancelButtonProps: { style: { display: "none" } },
      });
      return;
    }
    const add = async () => {
      try {
        await saveCustom([...custom.filter((t) => t.id !== theme.id), theme]);
        await choose(theme);
        message.success(`Theme “${theme.name}” added`);
      } catch (e) {
        message.error((e as Error).message);
      }
    };
    if (warnings.length === 0) return add();
    confirm({
      title: `“${theme.name}” may be hard to read`,
      content: (
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ),
      okText: "Use it anyway",
      onOk: add,
    });
  };

  const remove = async (t: Theme) => {
    try {
      await saveCustom(custom.filter((x) => x.id !== t.id));
      if (active.id === t.id) await choose(BUILTIN_THEMES[0]);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <Typography.Paragraph type="secondary">
        Jira and GitHub themes use the exact colours from Atlassian's and GitHub's published design tokens. Your choice is saved
        to your account and follows you to other devices.
      </Typography.Paragraph>
      <Space style={{ marginBottom: 12 }} wrap>
        <Upload accept=".json,application/json" showUploadList={false} beforeUpload={(f) => (upload(f), false)} disabled={!online}>
          <WriteButton icon={<UploadOutlined />}>Upload theme</WriteButton>
        </Upload>
        <Button icon={<DownloadOutlined />} onClick={() => download(active)}>
          Download template (current theme)
        </Button>
      </Space>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {[...BUILTIN_THEMES, ...custom].map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            active={JSON.stringify(t.colors) === JSON.stringify(active.colors)}
            onChoose={() => choose(t)}
            onDownload={() => download(t)}
            onRemove={t.builtin ? undefined : () => remove(t)}
          />
        ))}
      </div>
      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        message="Making your own"
        description="Download any theme above, edit the colours in the JSON file (each one is explained inside), and upload it. Uploads are checked: every colour must be #rrggbb, and you are warned if text would be hard to read."
      />
    </div>
  );
}

function ThemeCard({
  theme,
  active,
  onChoose,
  onDownload,
  onRemove,
}: {
  theme: Theme;
  active: boolean;
  onChoose: () => void;
  onDownload: () => void;
  onRemove?: () => void;
}) {
  const c = theme.colors;
  const warnings = checkContrast(c);
  const chip = (color: string, label: string) => {
    const bg = blend(color, c.panel, 0.16);
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: "0 5px", borderRadius: 3, background: bg, color: readable(color, bg) }}>
        {label}
      </span>
    );
  };
  return (
    <div
      style={{
        border: `2px solid ${active ? palette.accent : palette.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: palette.panel,
        cursor: "pointer",
      }}
      onClick={onChoose}
    >
      {/* Preview drawn in the theme's own colours. */}
      <div style={{ background: c.bg, padding: 10, display: "flex", gap: 8 }}>
        <div style={{ width: 54, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ height: 8, borderRadius: 2, background: c.selected }} />
          <div style={{ height: 6, width: 40, borderRadius: 2, background: c.muted, opacity: 0.5 }} />
          <div style={{ height: 6, width: 34, borderRadius: 2, background: c.muted, opacity: 0.5 }} />
        </div>
        <div style={{ flex: 1, background: c.panelDim, borderRadius: 4, padding: 6, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: c.muted, letterSpacing: 0.3 }}>IN PROGRESS</div>
          <div style={{ background: c.panel, borderRadius: 4, padding: "5px 6px", boxShadow: `0 1px 1px ${c.shadow}80` }}>
            <div style={{ fontSize: 11, color: c.fg, marginBottom: 4 }}>Port STM32 changes</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {chip(c.epic, "Epic")}
              {chip(c.warn, "High")}
              <span style={{ fontSize: 10, color: c.muted }}>⧗ 3d</span>
            </div>
          </div>
          <div style={{ background: c.panel, borderRadius: 4, padding: "5px 6px", border: `1px solid ${c.danger}` }}>
            <div style={{ fontSize: 11, color: c.fg }}>Stalled task</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ fontSize: 10, color: c.bg, background: c.accent, borderRadius: 3, padding: "1px 6px" }}>Save</span>
            <span style={{ fontSize: 10, color: c.accent }}>link</span>
            <span style={{ fontSize: 10, color: c.success }}>done</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {active && <CheckOutlined style={{ color: palette.accent }} />}
            {theme.name}
          </div>
          <div style={{ fontSize: 11, color: palette.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {theme.source} · text {contrast(c.fg, c.panel).toFixed(1)}:1
          </div>
        </div>
        {warnings.length > 0 && (
          <Tooltip title={warnings.join(" ")}>
            <span style={{ color: palette.warn, fontSize: 11 }}>⚠ contrast</span>
          </Tooltip>
        )}
        <Tooltip title="Download as an editable template">
          <Button
            size="small"
            type="text"
            icon={<DownloadOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            aria-label={`Download ${theme.name}`}
          />
        </Tooltip>
        {onRemove && (
          <Popconfirm title="Remove this theme?" onConfirm={(e) => (e?.stopPropagation(), onRemove())} onCancel={(e) => e?.stopPropagation()}>
            <Button size="small" type="text" danger onClick={(e) => e.stopPropagation()}>
              Remove
            </Button>
          </Popconfirm>
        )}
        {!active && <Button size="small">Use</Button>}
      </div>
    </div>
  );
}

function download(t: Theme) {
  const blob = new Blob([themeTemplate(t)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `jitterbug-theme-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
