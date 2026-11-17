"use client";

import { Plus } from "lucide-react";

import { addClipCommand } from "@/core/commands/projectCommands";
import { createClip, DEFAULT_STILL_DURATION } from "@/core/project/factory";
import type { TextStyle, Transform } from "@/core/project/schema";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

const PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  text: Partial<TextStyle>;
  transform: Partial<Transform>;
  previewClass: string;
}> = [
  { id: "title", label: "Título", text: { content: "Título", fontSize: 140 }, transform: {}, previewClass: "text-xl font-bold" },
  { id: "subtitle", label: "Subtítulo", text: { content: "Subtítulo", fontSize: 64 }, transform: { y: 400 }, previewClass: "text-sm font-medium" },
  { id: "basic", label: "Texto básico", text: { content: "Texto", fontSize: 96 }, transform: {}, previewClass: "text-base" },
];

export function TextPanel() {
  const project = useEditorStore(selectActiveProject);
  const playhead = useEditorStore((state) => state.playhead);
  const execute = useEditorStore((state) => state.execute);
  const selectClip = useEditorStore((state) => state.selectClip);

  const targetTrack = project?.tracks.find((track) => track.type === "overlay" && !track.locked);

  const addText = (preset: (typeof PRESETS)[number]) => {
    if (!project || !targetTrack) return;
    const clip = createClip({
      type: "text",
      name: preset.label,
      start: playhead,
      duration: DEFAULT_STILL_DURATION,
      text: preset.text,
      transform: preset.transform,
    });
    if (execute(addClipCommand(project, targetTrack.id, clip))) selectClip(clip.id);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Se añade en la pista de texto, en la posición del cursor de reproducción.
      </p>
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          disabled={!targetTrack}
          onClick={() => addText(preset)}
          className="group flex h-16 items-center justify-between rounded-lg border border-border bg-panel-raised px-4 text-left transition-colors outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <span className={preset.previewClass}>{preset.label}</span>
          <Plus className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden />
          <span className="sr-only">Añadir {preset.label}</span>
        </button>
      ))}
      {!targetTrack && (
        <p className="text-xs text-destructive">No hay una pista de texto desbloqueada.</p>
      )}
    </div>
  );
}
