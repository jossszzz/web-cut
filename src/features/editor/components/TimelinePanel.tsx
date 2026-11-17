"use client";

import { Magnet, Maximize2, Music, Plus, Trash2, Type, Video, ZoomIn, ZoomOut } from "lucide-react";

import { IconButton } from "@/components/shared/IconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { removeClipsCommand } from "@/core/commands/projectCommands";
import { addTrackCommand } from "@/core/commands/timelineCommands";
import type { TrackType } from "@/core/project/schema";
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND } from "@/core/timeline/geometry";
import { TimelineCanvas } from "@/features/timeline/components/TimelineCanvas";
import { TrackHeaders } from "@/features/timeline/components/TrackHeaders";

import { selectActiveProject, useEditorStore } from "../store/editorStore";

const ZOOM_STEP = 1.5;

const NEW_TRACKS: ReadonlyArray<{ type: TrackType; label: string; icon: typeof Video }> = [
  { type: "video", label: "Pista de video", icon: Video },
  { type: "overlay", label: "Pista de superposición (texto e imágenes)", icon: Type },
  { type: "audio", label: "Pista de audio", icon: Music },
];

export function TimelinePanel() {
  const project = useEditorStore(selectActiveProject);
  const selectedClipIds = useEditorStore((state) => state.selection.clipIds);
  const pxPerSecond = useEditorStore((state) => state.viewport.pxPerSecond);
  const snapping = useEditorStore((state) => state.snapping);
  const zoomBy = useEditorStore((state) => state.zoomBy);
  const zoomToFit = useEditorStore((state) => state.zoomToFit);
  const toggleSnapping = useEditorStore((state) => state.toggleSnapping);
  const execute = useEditorStore((state) => state.execute);
  const selectTrack = useEditorStore((state) => state.selectTrack);
  if (!project) return null;

  const addTrack = (type: TrackType) => {
    const command = addTrackCommand(project, type);
    const before = new Set(project.tracks.map((t) => t.id));
    if (execute(command)) {
      const created = selectActiveProject(useEditorStore.getState())?.tracks.find((t) => !before.has(t.id));
      if (created) selectTrack(created.id);
    }
  };

  return (
    <section aria-label="Línea de tiempo" className="flex h-[300px] shrink-0 flex-col border-t border-border bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <h2 className="mr-2 text-sm font-medium">Timeline</h2>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
            <Plus data-icon="inline-start" />
            Pista
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {NEW_TRACKS.map(({ type, label, icon: Icon }) => (
              <DropdownMenuItem key={type} onClick={() => addTrack(type)}>
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton
          label="Eliminar selección"
          hint="Supr"
          disabled={selectedClipIds.length === 0}
          onClick={() => execute(removeClipsCommand(project, selectedClipIds))}
        >
          <Trash2 />
        </IconButton>
        <IconButton
          label={snapping ? "Desactivar imán" : "Activar imán"}
          hint="N · mantén Alt para ignorarlo"
          aria-pressed={snapping}
          onClick={toggleSnapping}
          className={snapping ? "text-primary" : undefined}
        >
          <Magnet />
        </IconButton>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Ajustar al timeline" hint="⇧Z" onClick={zoomToFit}>
            <Maximize2 />
          </IconButton>
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
