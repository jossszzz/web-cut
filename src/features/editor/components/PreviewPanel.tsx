"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { IconButton } from "@/components/shared/IconButton";
import { getProjectDuration } from "@/core/project/queries";
import { formatTimecode, frameToUs, usToFrame } from "@/core/types/time";
import { PreviewCanvas } from "@/features/preview/components/PreviewCanvas";

import { selectActiveProject, useEditorStore, type PreviewScale } from "../store/editorStore";

const QUALITY: ReadonlyArray<{ value: PreviewScale; label: string }> = [
  { value: 1, label: "Completa" },
  { value: 0.5, label: "Media" },
  { value: 0.25, label: "Baja" },
];

/**
 * Tiempo actual. Componente aparte suscrito al número de frame (no al tiempo
 * exacto): durante la reproducción solo él se re-renderiza, una vez por frame
 * del proyecto, en lugar de todo el panel (canvas incluido) a 60 Hz.
 */
function CurrentTimecode({ fps }: { fps: number }) {
  const frame = useEditorStore((state) => usToFrame(state.playhead, fps));
  return <span className="text-primary">{formatTimecode(frameToUs(frame, fps), fps)}</span>;
}

export function PreviewPanel() {
  const project = useEditorStore(selectActiveProject);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const togglePlaying = useEditorStore((state) => state.togglePlaying);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const previewScale = useEditorStore((state) => state.previewScale);
  const setPreviewScale = useEditorStore((state) => state.setPreviewScale);
  if (!project) return null;

  const duration = getProjectDuration(project);
  const { width, height, fps } = project.settings;

  return (
    <section aria-label="Vista previa" className="flex min-h-0 flex-1 flex-col">
      <PreviewCanvas />
      <div className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-border bg-panel px-3">
        <output
          aria-label="Tiempo actual"
          className="font-mono text-xs tabular-nums"
        >
          <CurrentTimecode fps={fps} />
          <span className="text-muted-foreground"> / {formatTimecode(duration, fps)}</span>
        </output>
        <div className="flex items-center gap-1">
          <IconButton label="Ir al inicio" onClick={() => setPlayhead(0)}>
            <SkipBack />
          </IconButton>
          <IconButton
            label={isPlaying ? "Pausar" : "Reproducir"}
            hint="Espacio"
            size="icon"
            variant="secondary"
            onClick={togglePlaying}
            disabled={duration === 0}
          >
            {isPlaying ? <Pause /> : <Play />}
          </IconButton>
          <IconButton label="Ir al final" onClick={() => setPlayhead(duration)}>
            <SkipForward />
          </IconButton>
        </div>
        <div className="flex items-center gap-3 justify-self-end text-xs text-muted-foreground">
          <span className="tabular-nums">
            {width} × {height} · {fps} fps
          </span>
          <label className="flex items-center gap-1.5">
            <span>Calidad</span>
            <select
              value={previewScale}
              onChange={(event) => setPreviewScale(Number(event.target.value) as PreviewScale)}
              className="h-7 rounded-md border border-input bg-input/30 px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Calidad de la vista previa"
            >
              {QUALITY.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}
