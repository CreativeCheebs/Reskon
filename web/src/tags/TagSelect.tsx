import { Select, Tag as AntTag } from "antd";
import { cleanTags, MAX_TAG_LENGTH } from "./tags";
import { useTags } from "./tags";
import { palette } from "../theme/palette";

// Picks tags by name: choose from the ones that exist, or type a new one and
// press Enter (or a comma). New names are made when what holds them is saved.
// `fixed` tags are shown but cannot be removed here (a session's tags that
// come from its task).

export function TagSelect({
  value,
  onChange,
  fixed = [],
  disabled,
  size,
  placeholder = "Add tags",
  id,
  ariaLabel = "Tags",
  autoFocus,
}: {
  /** The tags that can be changed, by name. */
  value: string[];
  onChange: (names: string[]) => void;
  fixed?: string[];
  disabled?: boolean;
  size?: "small" | "middle";
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const { tags } = useTags();
  const fixedKeys = new Set(fixed.map((f) => f.toLowerCase()));
  return (
    <Select
      id={id}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      mode="tags"
      size={size}
      style={{ width: "100%" }}
      disabled={disabled}
      placeholder={placeholder}
      tokenSeparators={[","]}
      maxTagTextLength={MAX_TAG_LENGTH}
      value={[...fixed, ...value]}
      onChange={(vals: string[]) => onChange(cleanTags(vals).filter((n) => !fixedKeys.has(n.toLowerCase())))}
      options={tags.filter((t) => !fixedKeys.has(t.name.toLowerCase())).map((t) => ({ value: t.name, label: t.name }))}
      tagRender={({ label, value: v, closable, onClose }) => {
        const own = !fixedKeys.has(String(v).toLowerCase());
        return (
          <AntTag
            closable={closable && own && !disabled}
            onClose={onClose}
            onMouseDown={(e) => e.preventDefault()}
            style={{ marginInlineEnd: 4, borderColor: own ? undefined : palette.border }}
            title={own ? undefined : "From the task: it follows the task's tags"}
          >
            {label}
          </AntTag>
        );
      }}
    />
  );
}
