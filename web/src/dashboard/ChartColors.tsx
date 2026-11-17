import { Form } from "antd";
import { ColorField } from "../theme/ColorField";
import { palette } from "../theme/palette";
import { optionColor, seriesColors } from "./format";
import type { MetricSeries, WidgetOptions } from "./types";

// The widget editor's colour settings for a chart: one colour for a chart
// with a single series, or one per series (by energy type, area, and so
// on). Picked colours are saved with the widget (options.color and
// options.series_colors); a series with none keeps its own colour.

export function ChartColors({
  series,
  options,
  onChange,
}: {
  series: Pick<MetricSeries, "key" | "label" | "color">[];
  options: WidgetOptions;
  onChange: (o: WidgetOptions) => void;
}) {
  if (series.length === 0) {
    return (
      <Form.Item label="Colour" style={{ marginBottom: 10 }}>
        <ColorField value={optionColor(options.color)} onChange={(hex) => onChange({ ...options, color: hex ?? undefined })} />
      </Form.Item>
    );
  }
  const shown = seriesColors(series, options.series_colors);
  const set = (key: string, hex: string | null) => {
    const next = { ...options.series_colors };
    if (hex) next[key] = hex;
    else delete next[key];
    onChange({ ...options, series_colors: Object.keys(next).length ? next : undefined });
  };
  return (
    <Form.Item label="Colours" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {series.map((s, i) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: palette.muted, fontSize: 12 }}>
            <ColorField allowClear value={shown[i]} onChange={(hex) => set(s.key, hex)} />
            {s.label}
          </span>
        ))}
      </div>
    </Form.Item>
  );
}
