import { canClipLiveOn } from "../project/compat";
import { createClip, DEFAULT_STILL_DURATION, type FactoryOptions } from "../project/factory";
import { clipEnd } from "../project/queries";
import type { Clip, MediaAsset, MediaKind, Project, Track } from "../project/schema";
import type { Microseconds } from "../types/time";

export function isTrackCompatible(track: Track, kind: MediaKind): boolean {
  return canClipLiveOn(kind, track);
}

/** Pista por defecto para un medio: la primera compatible y desbloqueada, empezando por abajo para video. */
export function pickTargetTrack(project: Project, kind: MediaKind): Track | null {
  const candidates = project.tracks.filter((t) => !t.locked && isTrackCompatible(t, kind));
  if (kind === "audio") return candidates[0] ?? null;
  // Video principal: la pista de video más baja (capa base de la composición).
  const videoTracks = candidates.filter((t) => t.type === "video");
  return videoTracks.at(-1) ?? candidates[0] ?? null;
}

function overlaps(clip: Clip, start: Microseconds, end: Microseconds): boolean {
  return clip.start < end && start < clipEnd(clip);
}

/**
 * Inicio para insertar un clip sin solaparse: `desired` si el hueco está
 * libre; si no, el final del último clip de la pista.
 */
export function findInsertionStart(track: Track, desired: Microseconds, duration: Microseconds): Microseconds {
  const start = Math.max(0, Math.round(desired));
  if (!track.clips.some((clip) => overlaps(clip, start, start + duration))) return start;
  return track.clips.reduce((end, clip) => Math.max(end, clipEnd(clip)), 0);
}

export function clipDurationForAsset(asset: MediaAsset): Microseconds {
  return asset.kind === "image" || !asset.duration ? DEFAULT_STILL_DURATION : asset.duration;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function createClipFromAsset(asset: MediaAsset, start: Microseconds, options?: FactoryOptions): Clip {
  return createClip(
    {
      type: asset.kind,
      name: stripExtension(asset.name),
      assetId: asset.id,
      start,
      duration: clipDurationForAsset(asset),
    },
    options,
  );
}

/** Número de clips del proyecto que usan un asset. */
export function countAssetUsage(project: Project, assetId: string): number {
  return project.tracks.reduce((n, t) => n + t.clips.filter((c) => c.assetId === assetId).length, 0);
}
