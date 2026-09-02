"use client";

import { useEffect, useState } from "react";
import { Hammer, Plus, RotateCcw, RotateCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  EDITOR_TOOLS,
  FLOOR_SWATCHES,
  toolSupportsYaw,
  type EditorTool,
  type OfficeLayoutSummary,
} from "@/lib/office-blueprint";
import { cn } from "@/lib/utils";

type Props = {
  editing: boolean;
  dirty: boolean;
  busy: boolean;
  tool: EditorTool;
  color: string;
  yaw: number;
  layoutName: string;
  layouts: OfficeLayoutSummary[];
  activeLayoutId: string | null;
  onToggleEdit: () => void;
  onTool: (tool: EditorTool) => void;
  onColor: (color: string) => void;
  onRotate: () => void;
  onRename: (name: string) => void;
  onSave: () => void;
  onCreate: (name: string, source: "empty" | "hq" | "copy") => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onRestoreHq: () => void;
};

export function OfficeEditorHud({
  editing,
  dirty,
  busy,
  tool,
  color,
  yaw,
  layoutName,
  layouts,
  activeLayoutId,
  onToggleEdit,
  onTool,
  onColor,
  onRotate,
  onRename,
  onSave,
  onCreate,
  onActivate,
  onDelete,
  onRestoreHq,
}: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [newName, setNewName] = useState("New office");
  const [source, setSource] = useState<"empty" | "hq" | "copy">("empty");

  const active = layouts.find((l) => l.id === activeLayoutId);
  const activeIsHq = Boolean(active?.isProtected || active?.name === "HQ");
  const canRotate = toolSupportsYaw(tool);
  const yawQuarter = Math.round((((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4;

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        onRotate();
        return;
      }
      const match = EDITOR_TOOLS.find((t) => t.hotkey.toLowerCase() === e.key.toLowerCase());
      if (match) {
        e.preventDefault();
        onTool(match.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onTool, onRotate]);

  return (
    <>
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          <select
            className="h-8 max-w-[10rem] rounded-lg border border-zinc-700 bg-zinc-950/90 px-2 text-[11px] text-zinc-200"
            value={activeLayoutId ?? ""}
            onChange={(e) => {
              if (e.target.value) onActivate(e.target.value);
            }}
            disabled={busy || editing}
            aria-label="Office layout"
          >
            {layouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.isProtected || layout.name === "HQ" ? "HQ (original)" : layout.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant={editing ? "primary" : "secondary"}
            className="!h-8 !px-3 text-[11px]"
            onClick={onToggleEdit}
            disabled={busy}
          >
            <Hammer size={14} />
            {editing ? "Done" : "Arrange"}
          </Button>
        </div>
      </div>

      {editing && (
        <div className="office-hotbar pointer-events-auto">
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
            <input
              value={layoutName}
              onChange={(e) => onRename(e.target.value)}
              className="h-8 w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 disabled:opacity-60"
              aria-label="Layout name"
              disabled={activeIsHq}
              title={activeIsHq ? "HQ keeps its name" : undefined}
            />
            <Button type="button" className="!h-8 !px-3 text-[11px]" onClick={onSave} disabled={busy || !dirty}>
              <Save size={14} />
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="!h-8 !px-3 text-[11px]"
              onClick={() => setNewOpen(true)}
              disabled={busy}
            >
              <Plus size={14} />
              New
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="!h-8 !px-3 text-[11px]"
              onClick={() => setRestoreOpen(true)}
              disabled={busy}
              title="Reset HQ to the original floor plan"
            >
              <RotateCcw size={14} />
              Restore HQ
            </Button>
            {activeLayoutId && !activeIsHq && layouts.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                className="!h-8 !px-3 text-[11px] text-red-300"
                onClick={() => onDelete(activeLayoutId)}
                disabled={busy}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
          {activeIsHq && (
            <p className="mb-2 text-center text-[10px] text-amber-200/90">
              HQ is protected — you can edit and save, or Restore HQ to undo back to the original.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1">
            {EDITOR_TOOLS.map((item) => (
              <button
                key={item.id}
                type="button"
                title={`${item.label} (${item.hotkey})`}
                className={cn(
                  "min-w-10 rounded-md border px-2 py-1 text-[10px] font-medium",
                  tool === item.id
                    ? "border-indigo-400 bg-indigo-500 text-white"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
                )}
                onClick={() => onTool(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              title="Rotate placement (R)"
              disabled={!canRotate}
              className={cn(
                "min-w-10 rounded-md border px-2 py-1 text-[10px] font-medium inline-flex items-center gap-1",
                canRotate
                  ? "border-amber-500/60 bg-zinc-900 text-amber-200 hover:bg-zinc-800"
                  : "border-zinc-800 bg-zinc-950 text-zinc-600",
              )}
              onClick={onRotate}
            >
              <RotateCw size={12} />
              Rotate
              <span className="opacity-70">{yawQuarter * 90}°</span>
            </button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1">
            {FLOOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Color ${swatch}`}
                className={cn(
                  "size-5 rounded-full border",
                  color === swatch ? "border-white ring-2 ring-indigo-400" : "border-zinc-600",
                )}
                style={{ background: swatch }}
                onClick={() => onColor(swatch)}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => onColor(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
              aria-label="Custom color"
            />
          </div>
          <p className="mt-1 text-center text-[10px] text-zinc-400">
            Click places · drag looks around · R rotates · erase highlights only what removes
          </p>
        </div>
      )}

      <Dialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New office layout"
        description="Start empty, copy HQ, or duplicate this plan. HQ itself stays protected."
        confirmLabel="Create"
        onConfirm={() => {
          onCreate(newName, source);
          setNewOpen(false);
        }}
        busy={busy}
      >
        <label className="mb-2 block text-xs text-zinc-400">
          Name
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm text-zinc-300">
          {(
            [
              ["empty", "Empty lot"],
              ["hq", "Copy HQ"],
              ["copy", "Duplicate current"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="layout-source"
                checked={source === value}
                onChange={() => setSource(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Restore original HQ?"
        description="This resets HQ to the built-in floor plan (rooms, desks, furniture). Your other saved layouts stay."
        confirmLabel="Restore HQ"
        onConfirm={() => {
          onRestoreHq();
          setRestoreOpen(false);
        }}
        busy={busy}
      />
    </>
  );
}
