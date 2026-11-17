"use client";

import { Lock, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateClipCommand, type ClipPatch } from "@/core/commands/projectCommands";
import { IDENTITY_TRANSFORM } from "@/core/project/factory";
import type { ClipLocation } from "@/core/project/queries";
import type { Project, Transform } from "@/core/project/schema";
import { formatTimecode } from "@/core/types/time";
import { CLIP_COLORS } from "@/lib/constants/clipColors";

import { useEditorStore } from "../../store/editorStore";
import { InspectorSection, NumberField, ReadOnlyField, SliderField, TextField } from "./fields";

export function ClipInspector({ project, location }: { project: Project; location: ClipLocation }) {
  const execute = useEditorStore((state) => state.execute);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const { clip, track } = location;
  const { fps } = project.settings;
  const t = clip.transform;

  const update = (patch: ClipPatch, label: string, mergeKey?: string) => {
    // Leer el proyecto más reciente: durante un arrastre el prop puede ir un render por detrás.
    const latest = useEditorStore.getState();
    const current = latest.activeProjectId ? latest.projects[latest.activeProjectId] : project;
    execute(updateClipCommand(current, clip.id, patch, { label, mergeKey }));
  };
  const transform = (value: Partial<Transform>, label: string, field?: string) =>
    update({ transform: value }, label, field ? `${clip.id}:${field}` : undefined);

  const isVisual = clip.type !== "audio";

  return (
    <fieldset disabled={track.locked} className="min-w-0">
      <InspectorSection title="Clip">
        <div className="flex items-center gap-2">
          <Badge style={{ backgroundColor: CLIP_COLORS[clip.type].fill }} className="text-white">
            {CLIP_COLORS[clip.type].label}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">en {track.name}</span>
        </div>
        {track.locked && (
          <p className="flex items-center gap-2 rounded-md bg-amber-400/10 px-2 py-1.5 text-xs text-amber-300">
            <Lock className="size-3.5" aria-hidden /> La pista está bloqueada.
          </p>
        )}
        <TextField label="Nombre" value={clip.name} onCommit={(name) => update({ name }, "Renombrar clip")} />
        <div className="flex flex-col gap-1.5">
          <ReadOnlyField label="Inicio" value={formatTimecode(clip.start, fps)} />
          <ReadOnlyField label="Duración" value={formatTimecode(clip.duration, fps)} />
          <ReadOnlyField label="Inicio en fuente" value={formatTimecode(clip.sourceStart, fps)} />
        </div>
      </InspectorSection>

      {clip.type === "text" && clip.text && (
        <InspectorSection title="Texto">
          <TextField
            label="Contenido"
            multiline
            value={clip.text.content}
            onCommit={(content) => update({ text: { content } }, "Editar texto")}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Tamaño"
              value={clip.text.fontSize}
              min={8}
              max={600}
              suffix="px"
              onCommit={(fontSize) => update({ text: { fontSize } }, "Tamaño de texto")}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${clip.id}-color`} className="text-xs text-muted-foreground">
                Color
              </label>
              <input
                id={`${clip.id}-color`}
                type="color"
                value={clip.text.color}
                onChange={(event) => update({ text: { color: event.target.value } }, "Color de texto", `${clip.id}:color`)}
                onBlur={sealHistory}
                className="h-8 w-full cursor-pointer rounded-lg border border-input bg-input/30 px-1"
              />
            </div>
          </div>
        </InspectorSection>
      )}

      {isVisual ? (
        <InspectorSection
          title="Transformación"
          action={
            <Button
              variant="ghost"
              size="xs"
              onClick={() => transform(IDENTITY_TRANSFORM, "Restablecer transformación")}
            >
              <RotateCcw data-icon="inline-start" />
              Restablecer
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Posición X" value={t.x} suffix="px" onCommit={(x) => transform({ x }, "Mover clip")} />
            <NumberField label="Posición Y" value={t.y} suffix="px" onCommit={(y) => transform({ y }, "Mover clip")} />
          </div>
          <SliderField
            label="Escala"
            value={Math.round(t.scaleX * 100)}
            min={1}
            max={400}
            format={(v) => `${v}%`}
            onChange={(v) => transform({ scaleX: v / 100, scaleY: v / 100 }, "Escalar clip", "scale")}
            onCommit={sealHistory}
          />
          <SliderField
            label="Rotación"
            value={t.rotation}
            min={-180}
            max={180}
            format={(v) => `${v}°`}
            onChange={(rotation) => transform({ rotation }, "Rotar clip", "rotation")}
            onCommit={sealHistory}
          />
          <SliderField
            label="Opacidad"
            value={Math.round(t.opacity * 100)}
            min={0}
            max={100}
            format={(v) => `${v}%`}
            onChange={(v) => transform({ opacity: v / 100 }, "Opacidad", "opacity")}
            onCommit={sealHistory}
          />
        </InspectorSection>
      ) : (
        <InspectorSection title="Audio">
          <p className="text-xs text-muted-foreground">El control de volumen llega en la Fase 5.</p>
        </InspectorSection>
      )}
    </fieldset>
  );
}
