import { findClip } from "../project/queries";
import type { Clip, Project } from "../project/schema";
import { secondsToUs, usToSeconds, type Microseconds } from "../types/time";

/**
 * Geometría del timeline. La escala temporal (`pxPerSecond`) es independiente
 * del ancho de la pantalla; el canvas solo muestra una ventana de ella.
 */

export interface TimelineLayout {
  rulerHeight: number;
  trackHeight: number;
  trackGap: number;
}

export const DEFAULT_TIMELINE_LAYOUT: TimelineLayout = {
  rulerHeight: 28,
  trackHeight: 48,
  trackGap: 4,
};

export interface TimelineViewport {
  /** Píxeles CSS por segundo. */
  pxPerSecond: number;
  /** Desplazamiento horizontal en píxeles CSS. */
  scrollX: number;
}

export const MIN_PX_PER_SECOND = 8;
export const MAX_PX_PER_SECOND = 480;
export const DEFAULT_VIEWPORT: TimelineViewport = { pxPerSecond: 80, scrollX: 0 };

export function clampZoom(pxPerSecond: number): number {
  return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, pxPerSecond));
}

export function timeToX(time: Microseconds, viewport: TimelineViewport): number {
  return usToSeconds(time) * viewport.pxPerSecond - viewport.scrollX;
}

export function xToTime(x: number, viewport: TimelineViewport): Microseconds {
  return Math.max(0, secondsToUs((x + viewport.scrollX) / viewport.pxPerSecond));
}

export function trackTop(trackIndex: number, layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT): number {
  return layout.rulerHeight + trackIndex * (layout.trackHeight + layout.trackGap);
}

export function getContentHeight(trackCount: number, layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT): number {
  return trackTop(trackCount, layout);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getClipRect(
  clip: Clip,
  trackIndex: number,
  viewport: TimelineViewport,
  layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT,
): Rect {
  const x = timeToX(clip.start, viewport);
  return {
    x,
    y: trackTop(trackIndex, layout),
    width: Math.max(1, usToSeconds(clip.duration) * viewport.pxPerSecond),
    height: layout.trackHeight,
  };
}

/** Ancho de la zona sensible para recortar en cada borde de un clip. */
export const TRIM_HANDLE_PX = 6;

export type TimelineHit =
  | { kind: "ruler" }
  | { kind: "clip"; trackId: string; clipId: string; edge: "start" | "end" | null }
  | { kind: "track"; trackId: string }
  | { kind: "empty" };

export function hitTest(
  project: Project,
  x: number,
  y: number,
  viewport: TimelineViewport,
  layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT,
): TimelineHit {
  if (y < layout.rulerHeight) return { kind: "ruler" };

  const rowHeight = layout.trackHeight + layout.trackGap;
  const trackIndex = Math.floor((y - layout.rulerHeight) / rowHeight);
  const withinRow = (y - layout.rulerHeight) % rowHeight < layout.trackHeight;
  const track = project.tracks[trackIndex];
  if (!track || !withinRow) return { kind: "empty" };

  // Recorrer en orden inverso para priorizar el clip dibujado encima.
  for (let i = track.clips.length - 1; i >= 0; i--) {
    const rect = getClipRect(track.clips[i], trackIndex, viewport, layout);
    if (x >= rect.x && x < rect.x + rect.width) {
      // Los bordes solo son sensibles si el clip es lo bastante ancho para moverlo también.
      const handles = rect.width >= TRIM_HANDLE_PX * 3;
      const edge =
        handles && x < rect.x + TRIM_HANDLE_PX ? "start" : handles && x >= rect.x + rect.width - TRIM_HANDLE_PX ? "end" : null;
      return { kind: "clip", trackId: track.id, clipId: track.clips[i].id, edge };
    }
  }
  return { kind: "track", trackId: track.id };
}

/** Centro (en coordenadas del canvas) de un clip; útil para pruebas y accesibilidad. */
export function getClipCenter(
  project: Project,
  clipId: string,
  viewport: TimelineViewport,
  layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT,
): { x: number; y: number } | null {
  const location = findClip(project, clipId);
  if (!location) return null;
  const rect = getClipRect(location.clip, location.trackIndex, viewport, layout);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

const TICK_STEPS_SECONDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MIN_MAJOR_TICK_PX = 80;

/** Intervalos de marcas de la regla adecuados para el zoom actual (en segundos). */
export function getRulerTickSteps(pxPerSecond: number): { major: number; minor: number } {
  const major =
    TICK_STEPS_SECONDS.find((step) => step * pxPerSecond >= MIN_MAJOR_TICK_PX) ??
    TICK_STEPS_SECONDS[TICK_STEPS_SECONDS.length - 1];
  return { major, minor: major / 5 };
}

/** Aplica zoom manteniendo fijo el instante bajo `anchorX`. */
export function zoomAround(
  viewport: TimelineViewport,
  factor: number,
  anchorX: number,
): TimelineViewport {
  const pxPerSecond = clampZoom(viewport.pxPerSecond * factor);
  const anchorSeconds = (anchorX + viewport.scrollX) / viewport.pxPerSecond;
  const scrollX = Math.max(0, anchorSeconds * pxPerSecond - anchorX);
  return { pxPerSecond, scrollX };
}

/** Índice de la fila de pista bajo `y`, limitado a las pistas existentes. */
export function trackIndexAtY(
  y: number,
  trackCount: number,
  layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT,
): number {
  const row = Math.floor((y - layout.rulerHeight) / (layout.trackHeight + layout.trackGap));
  return Math.min(Math.max(0, row), Math.max(0, trackCount - 1));
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** Clips que intersectan un rectángulo (selección por arrastre). */
export function clipsInRect(
  project: Project,
  rect: Rect,
  viewport: TimelineViewport,
  layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT,
): string[] {
  const ids: string[] = [];
  project.tracks.forEach((track, trackIndex) => {
    for (const clip of track.clips) {
      const r = getClipRect(clip, trackIndex, viewport, layout);
      const intersects =
        r.x < rect.x + rect.width && rect.x < r.x + r.width && r.y < rect.y + rect.height && rect.y < r.y + r.height;
      if (intersects) ids.push(clip.id);
    }
  });
  return ids;
}
