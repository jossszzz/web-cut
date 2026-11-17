"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { IconButton } from "@/components/shared/IconButton";
import { getProjectDuration } from "@/core/project/queries";
import { formatTimecode } from "@/core/types/time";
import { PreviewCanvas } from "@/features/preview/components/PreviewCanvas";

import { selectActiveProject, useEditorStore } from "../store/editorStore";

export function PreviewPanel() {
  const project = useEditorStore(selectActiveProject);
  const playhead = useEditorStore((state) => state.playhead);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const togglePlaying = useEditorStore((state) => state.togglePlaying);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
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
          <span className="text-primary">{formatTimecode(playhead, fps)}</span>
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
        <span className="justify-self-end text-xs text-muted-foreground tabular-nums">
          {width} × {height} · {fps} fps
        </span>
      </div>
    </section>
  );
}
