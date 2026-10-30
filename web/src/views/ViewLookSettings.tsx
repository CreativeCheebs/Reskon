import { useRef, useState } from "react";
import { Button, Drawer, Form, Popover, Segmented, Slider, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { ColorField } from "../theme/ColorField";
import { palette } from "../theme/palette";
import { IconPicker } from "../icons/IconPicker";
import { ViewIconMark } from "../icons/ViewIconMark";
import type { ImageFit, View, ViewBackground, ViewIcon } from "../types";

// Icon, colour and background of one view. Changes preview on the view
// behind the drawer as you make them and are kept only on Save.

export type ViewLook = { icon: ViewIcon; color: string | null; background: ViewBackground };

export const lookOf = (v: View): ViewLook => ({ icon: v.icon ?? {}, color: v.color ?? null, background: v.background ?? {} });

const MAX_MB = 8;

export function ViewLookSettings({
  view,
  onPreview,
  onClose,
}: {
  view: View;
  /** The look to show while the drawer is open; null = the saved one. */
  onPreview: (look: ViewLook | null) => void;
  onClose: () => void;
}) {
  const { updateView } = useApp();
  const [look, setLookState] = useState<ViewLook>(lookOf(view));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const bg = look.background;

  const setLook = (next: ViewLook) => {
    setLookState(next);
    onPreview(next);
  };
  const setBg = (patch: Partial<ViewBackground>) => setLook({ ...look, background: { ...bg, ...patch } });

  const close = () => {
    onPreview(null);
    onClose();
  };

  const upload = async (f: File) => {
    if (f.size > MAX_MB << 20) {
      message.error(`The image is over ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const img = await api.post<{ id: number }>("/images", f);
      setBg({ image_id: img.id, fit: bg.fit ?? "cover", opacity: bg.opacity ?? 1, blur: bg.blur ?? 0, surface_opacity: bg.surface_opacity ?? 0.85 });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      updateView(await api.patch<View>(`/views/${view.id}`, look));
      close();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pct = (v: number | undefined, d: number) => Math.round((v ?? d) * 100);

  return (
    <Drawer
      open
      width={400}
      title="Icon and background"
      onClose={close}
      extra={
        <WriteButton type="primary" size="small" loading={busy} onClick={save}>
          Save
        </WriteButton>
      }
    >
      <Form layout="vertical" size="small">
        <Form.Item label="Icon">
          <Popover
            trigger="click"
            placement="bottomLeft"
            open={iconOpen}
            onOpenChange={setIconOpen}
            content={
              <IconPicker
                value={look.icon}
                color={look.color}
                onChange={(icon) => {
                  setLook({ ...look, icon });
                  setIconOpen(false);
                }}
              />
            }
          >
            <Button style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {look.icon.emoji || look.icon.svg ? <ViewIconMark icon={look.icon} color={look.color} size={18} /> : null}
              {look.icon.emoji || look.icon.svg ? "Change…" : "Choose an icon…"}
            </Button>
          </Popover>
        </Form.Item>
        <Form.Item label="Colour" extra="Tints the icon in the sidebar and the view header. Emoji keep their own colours.">
          <ColorField allowClear value={look.color} onChange={(color) => setLook({ ...look, color })} />
        </Form.Item>

        <Form.Item label="Background image">
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload(f);
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {bg.image_id && (
              <div
                style={{
                  width: 96,
                  height: 54,
                  borderRadius: 4,
                  border: `1px solid ${palette.border}`,
                  background: `center / cover no-repeat url(/api/images/${bg.image_id})`,
                }}
              />
            )}
            <WriteButton loading={uploading} onClick={() => file.current?.click()}>
              {bg.image_id ? "Replace…" : "Upload…"}
            </WriteButton>
            {bg.image_id && (
              <Button type="text" danger onClick={() => setLook({ ...look, background: {} })}>
                Remove
              </Button>
            )}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            PNG, JPEG, GIF or WebP, up to {MAX_MB} MB.
          </Typography.Text>
        </Form.Item>

        {bg.image_id && (
          <>
            <Form.Item label="Fit">
              <Segmented<ImageFit>
                value={bg.fit ?? "cover"}
                onChange={(fit) => setBg({ fit })}
                options={[
                  { value: "cover", label: "Crop to fill" },
                  { value: "contain", label: "Fit whole image" },
                  { value: "stretch", label: "Stretch" },
                ]}
              />
            </Form.Item>
            <Form.Item label={`Image opacity · ${pct(bg.opacity, 1)}%`}>
              <Slider min={5} max={100} value={pct(bg.opacity, 1)} onChange={(v) => setBg({ opacity: v / 100 })} />
            </Form.Item>
            <Form.Item label={`Blur · ${bg.blur ?? 0}px`}>
              <Slider min={0} max={30} value={bg.blur ?? 0} onChange={(v) => setBg({ blur: v })} />
            </Form.Item>
            <Form.Item
              label={`Column and table transparency · ${100 - pct(bg.surface_opacity, 0.85)}%`}
              extra="How much of the image shows through board columns and tables. Cards stay solid so text stays readable."
            >
              <Slider min={0} max={90} value={100 - pct(bg.surface_opacity, 0.85)} onChange={(v) => setBg({ surface_opacity: 1 - v / 100 })} />
            </Form.Item>
          </>
        )}
      </Form>
    </Drawer>
  );
}
