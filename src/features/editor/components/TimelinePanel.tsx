"use client";

import { Trash2, ZoomIn, ZoomOut } from "lucide-react";

import { IconButton } from "@/components/shared/IconButton";
import { removeClipsCommand } from "@/core/commands/projectCommands";
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND } from "@/core/timeline/geometry";
import { TimelineCanvas } from "@/features/timeline/components/TimelineCanvas";
import { TrackHeaders } from "@/features/timeline/components/TrackHeaders";

import { selectActiveProject, useEditorStore } from "../store/editorStore";

const ZOOM_STEP = 1.5;

export function TimelinePanel() {
  const project = useEditorStore(selectActiveProject);
  const selectedClipIds = useEditorStore((state) => state.selection.clipIds);
  const pxPerSecond = useEditorStore((state) => state.viewport.pxPerSecond);
  const zoomBy = useEditorStore((state) => state.zoomBy);
  const execute = useEditorStore((state) => state.execute);
  if (!project) return null;

  return (
    <section aria-label="Línea de tiempo" className="flex h-[300px] shrink-0 flex-col border-t border-border bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <h2 className="mr-2 text-sm font-medium">Timeline</h2>
        <IconButton
          label="Eliminar selección"
          hint="Supr"
          disabled={selectedClipIds.length === 0}
          onClick={() => execute(removeClipsCommand(project, selectedClipIds))}
        >
          <Trash2 />
        </IconButton>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Alejar"
            hint="⌘/Ctrl + rueda"
            disabled={pxPerSecond <= MIN_PX_PER_SECOND}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            <ZoomOut />
          </IconButton>
          <span className="w-14 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {Math.round(pxPerSecond)} px/s
          </span>
          <IconButton
            label="Acercar"
            hint="⌘/Ctrl + rueda"
            disabled={pxPerSecond >= MAX_PX_PER_SECOND}
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            <ZoomIn />
          </IconButton>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <TrackHeaders />
        <TimelineCanvas />
      </div>
    </section>
  );
}
