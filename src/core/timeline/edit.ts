import { canClipLiveOn } from "../project/compat";
import { clipEnd, findClip } from "../project/queries";
import type { Clip, Project, Track } from "../project/schema";
import type { Microseconds } from "../types/time";
import { snapEdges, type SnapResult } from "./snapping";

/**
 * Reglas de edición temporal del timeline (funciones puras):
 * - Los clips de una misma pista nunca se solapan.
 * - Los clips no empiezan antes de 0.
 * - Un recorte no puede ir más allá del material disponible en el archivo fuente.
 */

export interface Interval {
  start: Microseconds;
  end: Microseconds;
}

const EMPTY: ReadonlySet<string> = new Set();

function others(track: Track, ignoreIds: ReadonlySet<string>): Clip[] {
  return track.clips.filter((c) => !ignoreIds.has(c.id)).sort((a, b) => a.start - b.start);
}

/** Huecos libres de la pista; el último se extiende hasta el infinito. */
export function freeGaps(track: Track, ignoreIds: ReadonlySet<string> = EMPTY): Interval[] {
  const gaps: Interval[] = [];
  let cursor = 0;
  for (const clip of others(track, ignoreIds)) {
    if (clip.start > cursor) gaps.push({ start: cursor, end: clip.start });
    cursor = Math.max(cursor, clipEnd(clip));
  }
  gaps.push({ start: cursor, end: Number.POSITIVE_INFINITY });
  return gaps;
}

export function isRangeFree(
  track: Track,
  start: Microseconds,
  end: Microseconds,
  ignoreIds: ReadonlySet<string> = EMPTY,
): boolean {
  return start >= 0 && others(track, ignoreIds).every((c) => clipEnd(c) <= start || c.start >= end);
}

/** Inicio libre más cercano a `desired` donde cabe un clip de `duration`. */
export function nearestFreeStart(
  track: Track,
  desired: Microseconds,
  duration: Microseconds,
  ignoreIds: ReadonlySet<string> = EMPTY,
): Microseconds {
  let best = Number.POSITIVE_INFINITY;
  for (const gap of freeGaps(track, ignoreIds)) {
    if (gap.end - gap.start < duration) continue;
    const candidate = Math.min(Math.max(desired, gap.start), gap.end - duration);
    if (Math.abs(candidate - desired) < Math.abs(best - desired)) best = candidate;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Mover                                                               */
/* ------------------------------------------------------------------ */

export interface ClipMove {
  clipId: string;
  toTrackId: string;
  start: Microseconds;
}

export interface MoveRequest {
  clipIds: readonly string[];
  deltaTime: Microseconds;
  /** Desplazamiento en número de pistas (positivo = hacia abajo). */
  trackOffset: number;
}

export interface SnapOptions {
  points: readonly Microseconds[];
  threshold: Microseconds;
}

export interface MoveResult {
  moves: ClipMove[];
  snappedTo: Microseconds | null;
}

/**
 * Calcula el destino de un grupo de clips. Con un solo clip, si el destino
 * está ocupado se coloca en el hueco libre más cercano; con varios, el
 * movimiento debe ser válido tal cual o se rechaza (`null`).
 * Si las pistas destino no son compatibles, se intenta sin cambiar de pista.
 */
export function resolveMove(project: Project, request: MoveRequest, snap?: SnapOptions): MoveResult | null {
  const locations = request.clipIds.map((id) => findClip(project, id));
  if (locations.length === 0 || locations.some((l) => l === null || l.track.locked)) return null;
  const locs = locations as NonNullable<(typeof locations)[number]>[];
  const ids = new Set(request.clipIds);

  const targets = locs.map((l) => project.tracks[l.trackIndex + request.trackOffset]);
  const targetsValid = targets.every(
    (t, i) => t !== undefined && !t.locked && canClipLiveOn(locs[i].clip.type, t),
  );
  if (!targetsValid) {
    return request.trackOffset !== 0 ? resolveMove(project, { ...request, trackOffset: 0 }, snap) : null;
  }

  const minStart = Math.min(...locs.map((l) => l.clip.start));
  let delta = Math.max(Math.round(request.deltaTime), -minStart);
  let snappedTo: Microseconds | null = null;

  if (snap) {
    const edges = locs.flatMap(({ clip }) => [clip.start + delta, clipEnd(clip) + delta]);
    const result: SnapResult = snapEdges(edges, snap.points, snap.threshold);
    if (result.point !== null && minStart + delta + result.offset >= 0) {
      delta += result.offset;
      snappedTo = result.point;
    }
  }

  if (locs.length === 1) {
    const { clip } = locs[0];
    const desired = clip.start + delta;
    const start = nearestFreeStart(targets[0], desired, clip.duration, ids);
    if (start !== desired) snappedTo = null;
    return { moves: [{ clipId: clip.id, toTrackId: targets[0].id, start }], snappedTo };
  }

  const moves = locs.map(({ clip }, i) => ({ clipId: clip.id, toTrackId: targets[i].id, start: clip.start + delta }));
  const valid = moves.every((m, i) => isRangeFree(targets[i], m.start, m.start + locs[i].clip.duration, ids));
  return valid ? { moves, snappedTo } : null;
}

/* ------------------------------------------------------------------ */
/* Recortar                                                            */
/* ------------------------------------------------------------------ */

export type TrimEdge = "start" | "end";

export interface ClipTiming {
  start: Microseconds;
  duration: Microseconds;
  sourceStart: Microseconds;
}

export interface TrimOptions {
  /** Duración total del archivo fuente, si se conoce (video/audio). */
  sourceDuration?: Microseconds;
  minDuration: Microseconds;
  snap?: SnapOptions;
}

export interface TrimResult extends ClipTiming {
  snappedTo: Microseconds | null;
}

/** Medios con material fuente: recortar el inicio desplaza `sourceStart`. */
const hasSource = (clip: Clip) => clip.type === "video" || clip.type === "audio";

/**
 * Nuevo tiempo de un clip al arrastrar uno de sus bordes hasta `time`.
 * Limitado por los clips vecinos, la duración mínima y el material fuente.
 */
export function resolveTrim(
  project: Project,
  clipId: string,
  edge: TrimEdge,
  time: Microseconds,
  { sourceDuration, minDuration, snap }: TrimOptions,
): TrimResult | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return null;
  const { clip, track } = location;
  const end = clipEnd(clip);
  const neighbours = others(track, new Set([clip.id]));
  const prevEnd = Math.max(0, ...neighbours.filter((c) => clipEnd(c) <= clip.start).map(clipEnd));
  const nextStart = Math.min(Number.POSITIVE_INFINITY, ...neighbours.filter((c) => c.start >= end).map((c) => c.start));

  let target = Math.round(time);
  let snappedTo: Microseconds | null = null;
  if (snap) {
    const result = snapEdges([target], snap.points, snap.threshold);
    if (result.point !== null) {
      target = result.point;
      snappedTo = result.point;
    }
  }

  let next: ClipTiming;
  if (edge === "start") {
    const minStart = Math.max(prevEnd, hasSource(clip) ? clip.start - clip.sourceStart : 0);
    const maxStart = end - minDuration;
    const start = Math.min(Math.max(target, minStart), maxStart);
    next = {
      start,
      duration: end - start,
      sourceStart: hasSource(clip) ? clip.sourceStart + (start - clip.start) : clip.sourceStart,
    };
    if (start !== target) snappedTo = null;
  } else {
    const sourceLimit =
      hasSource(clip) && sourceDuration !== undefined
        ? clip.start + (sourceDuration - clip.sourceStart)
        : Number.POSITIVE_INFINITY;
    const newEnd = Math.min(Math.max(target, clip.start + minDuration), nextStart, sourceLimit);
    next = { start: clip.start, duration: newEnd - clip.start, sourceStart: clip.sourceStart };
    if (newEnd !== target) snappedTo = null;
  }
  return { ...next, snappedTo };
}
