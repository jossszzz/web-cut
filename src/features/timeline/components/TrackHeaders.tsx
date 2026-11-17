"use client";

import { Eye, EyeOff, Lock, LockOpen, Music, Type, Video, Volume2, VolumeX } from "lucide-react";
import { cn } from "cn";
import type { ReactNode } from "react";

import { updateTrackCommand, type TrackPatch } from "@/core/commands/projectCommands";
import type { Track } from "@/core/project/schema";
import { DEFAULT_TIMELINE_LAYOUT as layout } from "@/core/timeline/geometry";
import { formatDuration } from "@/core/types/time";
import { selectActiveProject, useEditorStore } from "@/features/editor/store/editorStore";

const TRACK_ICONS = { video: Video, overlay: Type, audio: Music } as const;

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

/** Columna de cabeceras de pista (DOM) alineada con las filas del canvas. */
export function TrackHeaders() {
  const project = useEditorStore(selectActiveProject);
  const selection = useEditorStore((state) => state.selection);
  const selectTrack = useEditorStore((state) => state.selectTrack);
  const selectClip = useEditorStore((state) => state.selectClip);
  const execute = useEditorStore((state) => state.execute);
  if (!project) return null;

  const toggle = (track: Track, patch: TrackPatch, label: string) =>
    execute(updateTrackCommand(project, track.id, patch, { label }));

  return (
    <div className="w-44 shrink-0 border-r border-border bg-panel">
      <div style={{ height: layout.rulerHeight }} className="border-b border-border" />
      <ul aria-label="Pistas" className="flex flex-col" style={{ gap: layout.trackGap }}>
        {project.tracks.map((track) => {
          const Icon = TRACK_ICONS[track.type];
          const selected = selection.trackId === track.id;
          return (
            <li key={track.id} style={{ height: layout.trackHeight }} className="relative">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => selectTrack(track.id)}
                className={cn(
                  "absolute inset-0 flex items-center gap-2 pr-[84px] pl-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate font-medium">{track.name}</span>
              </button>
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
                {track.type !== "audio" && (
                  <Toggle
                    label={track.visible ? `Ocultar ${track.name}` : `Mostrar ${track.name}`}
                    pressed={!track.visible}
                    onToggle={() => toggle(track, { visible: !track.visible }, "Visibilidad de pista")}
                  >
                    {track.visible ? <Eye /> : <EyeOff />}
                  </Toggle>
                )}
                {track.type !== "overlay" && (
                  <Toggle
                    label={track.muted ? `Activar sonido de ${track.name}` : `Silenciar ${track.name}`}
                    pressed={track.muted}
                    onToggle={() => toggle(track, { muted: !track.muted }, "Silenciar pista")}
                  >
                    {track.muted ? <VolumeX /> : <Volume2 />}
                  </Toggle>
                )}
                <Toggle
                  label={track.locked ? `Desbloquear ${track.name}` : `Bloquear ${track.name}`}
                  pressed={track.locked}
                  onToggle={() => toggle(track, { locked: !track.locked }, "Bloquear pista")}
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
                      onClick={(event) =>
                        selectClip(clip.id, { additive: event.shiftKey || event.metaKey || event.ctrlKey })
                      }
                    >
                      {clip.name}, {formatDuration(clip.start)} a {formatDuration(clip.start + clip.duration)}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
