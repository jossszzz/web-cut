import type { Microseconds } from "../types/time";
import type { Clip, Project, Track } from "./schema";

export function clipEnd(clip: Clip): Microseconds {
  return clip.start + clip.duration;
}

/** Duración de la composición: fin del último clip. Se calcula, no se almacena. */
export function getProjectDuration(project: Project): Microseconds {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clipEnd(clip));
  }
  return end;
}

export function findTrack(project: Project, trackId: string): Track | null {
  return project.tracks.find((track) => track.id === trackId) ?? null;
}

export interface ClipLocation {
  track: Track;
  trackIndex: number;
  clip: Clip;
  clipIndex: number;
}

export function findClip(project: Project, clipId: string): ClipLocation | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
    const track = project.tracks[trackIndex];
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex !== -1) {
      return { track, trackIndex, clip: track.clips[clipIndex], clipIndex };
    }
  }
  return null;
}

export function isClipActiveAt(clip: Clip, time: Microseconds): boolean {
  return clip.start <= time && time < clipEnd(clip);
}

/**
 * Clips visuales activos en `time`, en orden de pintado: de la pista inferior
 * a la superior (la primera pista del timeline queda encima).
 * Excluye pistas de audio y pistas ocultas.
 */
export function getVisualClipsAt(
  project: Project,
  time: Microseconds,
): Array<{ track: Track; clip: Clip }> {
  const result: Array<{ track: Track; clip: Clip }> = [];
  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i];
    if (track.type === "audio" || !track.visible) continue;
    for (const clip of track.clips) {
      if (clip.type !== "audio" && isClipActiveAt(clip, time)) {
        result.push({ track, clip });
      }
    }
  }
  return result;
}
