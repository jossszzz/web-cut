"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import {
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  Music,
  Type,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ReactNode } from "react";

import { updateTrackCommand, type TrackPatch } from "@/core/commands/projectCommands";
import { moveTrackCommand } from "@/core/commands/timelineCommands";
import type { Project, Track } from "@/core/project/schema";
import { DEFAULT_TIMELINE_LAYOUT as layout } from "@/core/timeline/geometry";
import { formatDuration } from "@/core/types/time";
import { selectActiveProject, useEditorStore, type Selection } from "@/features/editor/store/editorStore";

const TRACK_ICONS = { video: Video, overlay: Type, audio: Music } as const;

/** Las pistas solo se reordenan en vertical. */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function Toggle({
  label,
  pressed,
  onToggle,
  children,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "grid size-6 place-items-center rounded text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
        pressed && "text-amber-300",
      )}
    >
      {children}
    </button>
  );
}

function TrackRow({ track, project, selection }: { track: Track; project: Project; selection: Selection }) {
  const selectTrack = useEditorStore((state) => state.selectTrack);
  const selectClip = useEditorStore((state) => state.selectClip);
  const execute = useEditorStore((state) => state.execute);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const Icon = TRACK_ICONS[track.type];
  const selected = selection.trackId === track.id;
  const toggle = (patch: TrackPatch, label: string) => execute(updateTrackCommand(project, track.id, patch, { label }));

  return (
    <li
      ref={setNodeRef}
      style={{ height: layout.trackHeight, transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 shadow-lg ring-1 ring-primary/60")}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => selectTrack(track.id)}
        className={cn(
          "absolute inset-0 flex items-center gap-2 pr-[84px] pl-7 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selected ? "bg-primary/10 text-foreground" : "bg-panel text-muted-foreground hover:bg-accent/50",
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate font-medium">{track.name}</span>
      </button>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${track.name}`}
        className="absolute top-1/2 left-1 grid h-8 w-5 -translate-y-1/2 cursor-grab place-items-center rounded text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
        {track.type !== "audio" && (
          <Toggle
            label={track.visible ? `Ocultar ${track.name}` : `Mostrar ${track.name}`}
            pressed={!track.visible}
            onToggle={() => toggle({ visible: !track.visible }, "Visibilidad de pista")}
          >
            {track.visible ? <Eye /> : <EyeOff />}
          </Toggle>
        )}
        {track.type !== "overlay" && (
          <Toggle
            label={track.muted ? `Activar sonido de ${track.name}` : `Silenciar ${track.name}`}
            pressed={track.muted}
            onToggle={() => toggle({ muted: !track.muted }, "Silenciar pista")}
          >
            {track.muted ? <VolumeX /> : <Volume2 />}
          </Toggle>
        )}
        <Toggle
          label={track.locked ? `Desbloquear ${track.name}` : `Bloquear ${track.name}`}
          pressed={track.locked}
          onToggle={() => toggle({ locked: !track.locked }, "Bloquear pista")}
        >
          {track.locked ? <Lock /> : <LockOpen />}
        </Toggle>
      </div>
      {/* Alternativa accesible al canvas: lista de clips de la pista. */}
      <ul className="sr-only" aria-label={`Clips de ${track.name}`}>
        {track.clips.map((clip) => (
          <li key={clip.id}>
            <button
              type="button"
              aria-pressed={selection.clipIds.includes(clip.id)}
              onClick={(event) => selectClip(clip.id, { additive: event.shiftKey || event.metaKey || event.ctrlKey })}
            >
              {clip.name}, {formatDuration(clip.start)} a {formatDuration(clip.start + clip.duration)}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Cabeceras de pista (DOM) alineadas con las filas del canvas. Se reordenan
 * arrastrando el asa (o con teclado: espacio, flechas, espacio).
 */
export function TrackHeaders() {
  const project = useEditorStore(selectActiveProject);
  const selection = useEditorStore((state) => state.selection);
  const execute = useEditorStore((state) => state.execute);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!project) return null;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const toIndex = project.tracks.findIndex((t) => t.id === over.id);
    execute(moveTrackCommand(project, String(active.id), toIndex));
  };

  return (
    <div className="w-48 shrink-0 border-r border-border bg-panel">
      <div style={{ height: layout.rulerHeight }} className="border-b border-border" />
      <DndContext
        id="track-headers"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable: "Pulsa espacio para mover la pista, usa las flechas y pulsa espacio de nuevo para soltarla.",
          },
        }}
      >
        <SortableContext items={project.tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul aria-label="Pistas" className="flex flex-col" style={{ gap: layout.trackGap }}>
            {project.tracks.map((track) => (
              <TrackRow key={track.id} track={track} project={project} selection={selection} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
