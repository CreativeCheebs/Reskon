import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Select } from "antd";
import { useApp } from "../store";
import { palette } from "../theme/palette";

// Pick up to four subtypes and rank them by dragging. Rank sets the weight
// (from the subtype_weights setting); percentages are never typed.

export function RankedSubtypes({
  value,
  onChange,
  energyTypeId,
  disabled,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  energyTypeId?: number;
  disabled?: boolean;
}) {
  const { boot } = useApp();
  const weights = (boot.settings.subtype_weights as number[] | undefined) ?? [1, 0.5, 0.25, 0.25];
  const weightOf = (rank: number) => weights[Math.min(rank, weights.length) - 1];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const name = (id: number) => boot.subtypes.find((s) => s.id === id)?.name ?? `#${id}`;
  const available = boot.subtypes.filter(
    (s) => !value.includes(s.id) && (energyTypeId === undefined || s.energy_type_id === energyTypeId),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onChange(arrayMove(value, value.indexOf(Number(e.active.id)), value.indexOf(Number(e.over.id))));
  };

  // Nothing to pick: say so quietly rather than show a dead dropdown.
  if (value.length === 0 && available.length === 0)
    return (
      <span style={{ fontSize: 12, color: palette.subtle }}>
        {boot.subtypes.length === 0 ? "None configured (Settings → Subtypes)" : "None configured for this energy type"}
      </span>
    );

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={value} strategy={verticalListSortingStrategy}>
          {value.map((id, i) => (
            <Row
              key={id}
              id={id}
              label={name(id)}
              weight={weightOf(i + 1)}
              disabled={disabled}
              onRemove={() => onChange(value.filter((x) => x !== id))}
            />
          ))}
        </SortableContext>
      </DndContext>
      {value.length < 4 && (
        <Select
          size="small"
          style={{ width: "100%", marginTop: value.length ? 4 : 0 }}
          placeholder="+ Add subtype"
          value={null}
          aria-label="Add a subtype"
          disabled={disabled || !available.length}
          onChange={(id: number) => onChange([...value, id])}
          options={available.map((s) => ({ value: s.id, label: s.name }))}
          showSearch
          optionFilterProp="label"
        />
      )}
    </div>
  );
}

function Row({ id, label, weight, disabled, onRemove }: { id: number; label: string; weight: number; disabled?: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 8px",
        marginBottom: 4,
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        background: palette.panelDim,
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: "grab", color: palette.muted }} title="Drag to rank, or focus and press Space, then the arrow keys" aria-label={`Rank ${label}`}>
        ⋮⋮
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color: palette.muted, fontSize: 11 }}>{Math.round(weight * 100)}%</span>
      <Button size="small" type="text" disabled={disabled} onClick={onRemove} aria-label={`Remove ${label}`}>
        ✕
      </Button>
    </div>
  );
}
