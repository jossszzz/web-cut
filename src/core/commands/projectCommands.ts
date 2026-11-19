import { findClip, findTrack } from "../project/queries";
import type { Clip, Crop, Project, ProjectSettings, TextStyle, Track, Transform } from "../project/schema";
import type { Command } from "./types";

/* ------------------------------------------------------------------ */
/* Helpers inmutables                                                  */
/* ------------------------------------------------------------------ */

function mapTrack(project: Project, trackId: string, fn: (track: Track) => Track): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) => (track.id === trackId ? fn(track) : track)),
  };
}

function mapClip(project: Project, clipId: string, fn: (clip: Clip) => Clip): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.clips.some((clip) => clip.id === clipId)
        ? { ...track, clips: track.clips.map((clip) => (clip.id === clipId ? fn(clip) : clip)) }
        : track,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Clips                                                               */
/* ------------------------------------------------------------------ */

export interface ClipPatch {
  name?: string;
  transform?: Partial<Transform>;
  text?: Partial<TextStyle>;
  volume?: number;
  crop?: Partial<Crop>;
}

type ClipFields = Pick<Clip, "name" | "transform" | "text" | "volume" | "crop">;

function pickClipFields(clip: Clip, patch: ClipPatch): Partial<ClipFields> {
  const fields: Partial<ClipFields> = {};
  if (patch.name !== undefined) fields.name = clip.name;
  if (patch.transform !== undefined) fields.transform = clip.transform;
  if (patch.text !== undefined) fields.text = clip.text;
  if (patch.volume !== undefined) fields.volume = clip.volume;
  if (patch.crop !== undefined) fields.crop = clip.crop;
  return fields;
}

function applyClipPatch(clip: Clip, patch: ClipPatch): Partial<ClipFields> {
  const fields: Partial<ClipFields> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.transform !== undefined) fields.transform = { ...clip.transform, ...patch.transform };
  if (patch.text !== undefined && clip.text) fields.text = { ...clip.text, ...patch.text };
  if (patch.volume !== undefined) fields.volume = Math.min(4, Math.max(0, patch.volume));
  if (patch.crop !== undefined) fields.crop = { ...clip.crop, ...patch.crop };
  return fields;
}

export interface CommandOptions {
  label?: string;
  mergeKey?: string;
}

/**
 * Modifica propiedades de un clip. Devuelve `null` si el clip no existe o su
 * pista está bloqueada.
 */
export function updateClipCommand(
  project: Project,
  clipId: string,
  patch: ClipPatch,
  { label = "Editar clip", mergeKey }: CommandOptions = {},
): Command | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return null;

  const before = pickClipFields(location.clip, patch);
  const after = applyClipPatch(location.clip, patch);

  return {
    label,
    mergeKey,
    execute: (p) => mapClip(p, clipId, (clip) => ({ ...clip, ...after })),
    undo: (p) => mapClip(p, clipId, (clip) => ({ ...clip, ...before })),
  };
}

export function addClipCommand(project: Project, trackId: string, clip: Clip): Command | null {
  const track = findTrack(project, trackId);
  if (!track || track.locked) return null;

  return {
    label: `Añadir ${clip.name}`,
    execute: (p) =>
      mapTrack(p, trackId, (t) => ({
        ...t,
        clips: [...t.clips, clip].sort((a, b) => a.start - b.start),
      })),
    undo: (p) => mapTrack(p, trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clip.id) })),
  };
}

/** Elimina clips. Ignora los de pistas bloqueadas; `null` si no queda ninguno. */
export function removeClipsCommand(project: Project, clipIds: readonly string[]): Command | null {
  const removed = clipIds
    .map((id) => findClip(project, id))
    .filter((loc): loc is NonNullable<typeof loc> => loc !== null && !loc.track.locked)
    .map(({ track, clip, clipIndex }) => ({ trackId: track.id, clip, clipIndex }));

  if (removed.length === 0) return null;
  const ids = new Set(removed.map((r) => r.clip.id));
  const reinsertOrder = [...removed].sort((a, b) => a.clipIndex - b.clipIndex);

  return {
    label: removed.length === 1 ? `Eliminar ${removed[0].clip.name}` : `Eliminar ${removed.length} clips`,
    execute: (p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !ids.has(c.id)) })),
    }),
    undo: (p) =>
      reinsertOrder.reduce(
        (acc, { trackId, clip, clipIndex }) =>
          mapTrack(acc, trackId, (t) => {
            const clips = [...t.clips];
            clips.splice(Math.min(clipIndex, clips.length), 0, clip);
            return { ...t, clips };
          }),
        p,
      ),
  };
}

/* ------------------------------------------------------------------ */
/* Pistas                                                              */
/* ------------------------------------------------------------------ */

export type TrackPatch = Partial<Pick<Track, "name" | "muted" | "locked" | "visible">>;

export function updateTrackCommand(
  project: Project,
  trackId: string,
  patch: TrackPatch,
  { label = "Editar pista", mergeKey }: CommandOptions = {},
): Command | null {
  const track = findTrack(project, trackId);
  if (!track) return null;

  const before: TrackPatch = {};
  for (const key of Object.keys(patch) as Array<keyof TrackPatch>) {
    Object.assign(before, { [key]: track[key] });
  }

  return {
    label,
    mergeKey,
    execute: (p) => mapTrack(p, trackId, (t) => ({ ...t, ...patch })),
    undo: (p) => mapTrack(p, trackId, (t) => ({ ...t, ...before })),
  };
}

/* ------------------------------------------------------------------ */
/* Proyecto                                                            */
/* ------------------------------------------------------------------ */

export interface ProjectPatch {
  name?: string;
  settings?: Partial<ProjectSettings>;
}

export function updateProjectCommand(
  project: Project,
  patch: ProjectPatch,
  { label = "Editar proyecto", mergeKey }: CommandOptions = {},
): Command | null {
  if (patch.name !== undefined && patch.name.trim() === "") return null;

  const before = { name: project.name, settings: project.settings };
  const after = {
    name: patch.name?.trim() ?? project.name,
    settings: { ...project.settings, ...patch.settings },
  };

  return {
    label,
    mergeKey,
    execute: (p) => ({ ...p, ...after }),
    undo: (p) => ({ ...p, ...before }),
  };
}
