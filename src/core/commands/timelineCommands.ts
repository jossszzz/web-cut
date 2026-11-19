import { shiftKeyframes } from "../animation/keyframes";
import { createTrack } from "../project/factory";
import { findClip, findTrack } from "../project/queries";
import type { Clip, Project, Track, TrackType } from "../project/schema";
import type { ClipMove, ClipTiming } from "../timeline/edit";
import type { Command } from "./types";

/* ------------------------------------------------------------------ */
/* Clips                                                               */
/* ------------------------------------------------------------------ */

function applyMoves(project: Project, moves: readonly ClipMove[]): Project {
  const byId = new Map(moves.map((m) => [m.clipId, m]));
  const moving = new Map<string, Clip>();
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => {
      if (!byId.has(clip.id)) return true;
      moving.set(clip.id, clip);
      return false;
    }),
  }));
  for (const move of moves) {
    const clip = moving.get(move.clipId);
    const target = tracks.find((t) => t.id === move.toTrackId);
    if (clip && target) target.clips.push({ ...clip, start: move.start });
  }
  for (const track of tracks) track.clips.sort((a, b) => a.start - b.start);
  return { ...project, tracks };
}

/** Mueve clips (en el tiempo y/o a otra pista). `null` si no cambia nada. */
export function moveClipsCommand(project: Project, moves: readonly ClipMove[]): Command | null {
  const inverse: ClipMove[] = [];
  let changed = false;
  for (const move of moves) {
    const location = findClip(project, move.clipId);
    if (!location) return null;
    inverse.push({ clipId: move.clipId, toTrackId: location.track.id, start: location.clip.start });
    if (location.track.id !== move.toTrackId || location.clip.start !== move.start) changed = true;
  }
  if (!changed) return null;
  return {
    label: moves.length === 1 ? "Mover clip" : `Mover ${moves.length} clips`,
    execute: (p) => applyMoves(p, moves),
    undo: (p) => applyMoves(p, inverse),
  };
}

function setTiming(project: Project, clipId: string, timing: ClipTiming): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.clips.some((c) => c.id === clipId)
        ? {
            ...track,
            clips: track.clips.map((c) =>
              c.id === clipId
                ? // Los keyframes quedan anclados al contenido: si el inicio se mueve, se compensan.
                  { ...c, ...timing, keyframes: shiftKeyframes(c.keyframes, c.start - timing.start) }
                : c,
            ),
          }
        : track,
    ),
  };
}

/** Cambia inicio, duración y punto de entrada en la fuente (recorte). */
export function setClipTimingCommand(project: Project, clipId: string, timing: ClipTiming): Command | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return null;
  const { start, duration, sourceStart } = location.clip;
  if (start === timing.start && duration === timing.duration && sourceStart === timing.sourceStart) return null;
  const before: ClipTiming = { start, duration, sourceStart };
  return {
    label: "Recortar clip",
    execute: (p) => setTiming(p, clipId, timing),
    undo: (p) => setTiming(p, clipId, before),
  };
}

/* ------------------------------------------------------------------ */
/* Pistas                                                              */
/* ------------------------------------------------------------------ */

const TRACK_BASE_NAME: Record<TrackType, string> = {
  video: "Video",
  overlay: "Superposición",
  audio: "Audio",
};

/** "Video 3", "Audio 2"... el primer número libre para ese tipo. */
export function nextTrackName(project: Project, type: TrackType): string {
  const base = TRACK_BASE_NAME[type];
  const names = new Set(project.tracks.map((t) => t.name));
  for (let n = 1; ; n++) {
    const name = n === 1 && type !== "video" ? base : `${base} ${n}`;
    if (!names.has(name)) return name;
  }
}

/**
 * Posición por defecto: superposiciones arriba del todo, video encima de las
 * pistas de video existentes (capa superior) y audio al final.
 */
export function defaultTrackIndex(project: Project, type: TrackType): number {
  if (type === "overlay") return 0;
  if (type === "audio") return project.tracks.length;
  const firstVideo = project.tracks.findIndex((t) => t.type === "video");
  if (firstVideo !== -1) return firstVideo;
  const firstAudio = project.tracks.findIndex((t) => t.type === "audio");
  return firstAudio === -1 ? project.tracks.length : firstAudio;
}

function insertTrack(project: Project, track: Track, index: number): Project {
  const tracks = [...project.tracks];
  tracks.splice(Math.min(Math.max(0, index), tracks.length), 0, track);
  return { ...project, tracks };
}

function withoutTrack(project: Project, trackId: string): Project {
  return { ...project, tracks: project.tracks.filter((t) => t.id !== trackId) };
}

export function addTrackCommand(
  project: Project,
  type: TrackType,
  options: { track?: Track; index?: number } = {},
): Command {
  const track = options.track ?? { ...createTrack(type, nextTrackName(project, type)) };
  const index = options.index ?? defaultTrackIndex(project, type);
  return {
    label: `Añadir pista ${track.name}`,
    execute: (p) => insertTrack(p, track, index),
    undo: (p) => withoutTrack(p, track.id),
  };
}

/** Elimina una pista con sus clips. No se pueden eliminar pistas bloqueadas. */
export function removeTrackCommand(project: Project, trackId: string): Command | null {
  const index = project.tracks.findIndex((t) => t.id === trackId);
  const track = project.tracks[index];
  if (!track || track.locked) return null;
  return {
    label: `Eliminar pista ${track.name}`,
    execute: (p) => withoutTrack(p, trackId),
    undo: (p) => insertTrack(p, track, index),
  };
}

function reorder(project: Project, trackId: string, toIndex: number): Project {
  const from = project.tracks.findIndex((t) => t.id === trackId);
  if (from === -1) return project;
  const tracks = [...project.tracks];
  const [track] = tracks.splice(from, 1);
  tracks.splice(Math.min(Math.max(0, toIndex), tracks.length), 0, track);
  return { ...project, tracks };
}

export function moveTrackCommand(project: Project, trackId: string, toIndex: number): Command | null {
  const from = project.tracks.findIndex((t) => t.id === trackId);
  const target = Math.min(Math.max(0, toIndex), project.tracks.length - 1);
  if (from === -1 || from === target) return null;
  const name = findTrack(project, trackId)?.name ?? "";
  return {
    label: `Mover pista ${name}`,
    execute: (p) => reorder(p, trackId, target),
    undo: (p) => reorder(p, trackId, from),
  };
}
