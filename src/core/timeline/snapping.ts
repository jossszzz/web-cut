import { clipEnd } from "../project/queries";
import type { Project } from "../project/schema";
import type { Microseconds } from "../types/time";

/** Distancia de imán en píxeles; se convierte a tiempo según el zoom. */
export const SNAP_THRESHOLD_PX = 8;

export function snapThresholdUs(pxPerSecond: number): Microseconds {
  return Math.round((SNAP_THRESHOLD_PX / pxPerSecond) * 1_000_000);
}

/**
 * Puntos de imán: inicio del proyecto, playhead y bordes de los clips que no
 * se están editando.
 */
export function collectSnapPoints(
  project: Project,
  { excludeClipIds = new Set<string>(), playhead }: { excludeClipIds?: ReadonlySet<string>; playhead?: Microseconds },
): Microseconds[] {
  const points = new Set<Microseconds>([0]);
  if (playhead !== undefined) points.add(playhead);
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (excludeClipIds.has(clip.id)) continue;
      points.add(clip.start);
      points.add(clipEnd(clip));
    }
  }
  return [...points].sort((a, b) => a - b);
}

export interface SnapResult {
  /** Corrección a sumar al desplazamiento. */
  offset: Microseconds;
  /** Punto al que se ha imantado (para dibujar la guía), o `null`. */
  point: Microseconds | null;
}

/** Busca el punto más cercano a cualquiera de los bordes, dentro del umbral. */
export function snapEdges(
  edges: readonly Microseconds[],
  points: readonly Microseconds[],
  threshold: Microseconds,
): SnapResult {
  let best: SnapResult = { offset: 0, point: null };
  let bestDistance = threshold + 1;
  for (const edge of edges) {
    for (const point of points) {
      const distance = Math.abs(point - edge);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        best = { offset: point - edge, point };
      }
    }
  }
  return best;
}
