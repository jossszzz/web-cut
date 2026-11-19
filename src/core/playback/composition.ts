import { clipEnd, isClipActiveAt } from "../project/queries";
import type { Clip, Project, Track, Transition, TransitionType } from "../project/schema";
import { secondsToUs, type Microseconds } from "../types/time";
import { sourceTimeAt } from "./schedule";

/**
 * Composición visual en un instante: qué clips se pintan, en qué orden y con
 * qué transición. Las transiciones no requieren solapar clips: durante la
 * ventana centrada en el corte, el clip saliente mantiene su último fotograma
 * y el entrante su primero ("fotogramas congelados").
 */

export const MAX_TRANSITION_DURATION: Microseconds = secondsToUs(2);
export const DEFAULT_TRANSITION_DURATION: Microseconds = secondsToUs(0.6);

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  crossfade: "Fundido cruzado",
  fade: "Fundido a negro",
  "wipe-left": "Barrido",
  "slide-left": "Deslizar",
};

const isVisual = (clip: Clip) => clip.type !== "audio";

export interface TransitionState {
  type: TransitionType;
  /** 0 → solo el clip saliente; 1 → solo el entrante. */
  progress: number;
  role: "out" | "in";
}

export interface VisualLayer {
  track: Track;
  clip: Clip;
  /** Tiempo relativo al inicio del clip (limitado a su duración). */
  localTime: Microseconds;
  transition?: TransitionState;
}

/** Clip de la misma pista que termina exactamente donde empieza `clip`. */
export function previousAdjacent(track: Track, clip: Clip): Clip | null {
  return track.clips.find((c) => c.id !== clip.id && clipEnd(c) === clip.start) ?? null;
}

/** Siguiente clip adyacente (empieza donde termina `clip`). */
export function nextAdjacent(track: Track, clip: Clip): Clip | null {
  return track.clips.find((c) => c.id !== clip.id && c.start === clipEnd(clip)) ?? null;
}

/** Duración máxima de una transición entre dos clips: media ventana en cada uno. */
export function maxTransitionDuration(prev: Clip, clip: Clip): Microseconds {
  return Math.min(MAX_TRANSITION_DURATION, 2 * prev.duration, 2 * clip.duration);
}

export interface ActiveCut {
  prev: Clip;
  clip: Clip;
  transition: Transition;
  /** Ventana [start, end) centrada en el corte. */
  start: Microseconds;
  end: Microseconds;
}

/** Transición efectiva de un clip: solo si es visual y hay un clip adyacente antes. */
export function getCut(track: Track, clip: Clip): ActiveCut | null {
  if (!clip.transitionIn || !isVisual(clip) || track.type === "audio") return null;
  const prev = previousAdjacent(track, clip);
  if (!prev || !isVisual(prev)) return null;
  const duration = Math.min(clip.transitionIn.duration, maxTransitionDuration(prev, clip));
  const half = Math.round(duration / 2);
  return { prev, clip, transition: { ...clip.transitionIn, duration }, start: clip.start - half, end: clip.start + half };
}

function cutAt(track: Track, time: Microseconds): ActiveCut | null {
  for (const clip of track.clips) {
    const cut = getCut(track, clip);
    if (cut && time >= cut.start && time < cut.end) return cut;
  }
  return null;
}

function local(clip: Clip, time: Microseconds): Microseconds {
  return Math.min(Math.max(0, time - clip.start), clip.duration);
}

/** Capas visuales en orden de pintado (pista inferior primero). */
export function getVisualLayersAt(project: Project, time: Microseconds): VisualLayer[] {
  const layers: VisualLayer[] = [];
  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i];
    if (track.type === "audio" || !track.visible) continue;
    const cut = cutAt(track, time);
    if (cut) {
      const progress = (time - cut.start) / (cut.end - cut.start);
      const type = cut.transition.type;
      layers.push({ track, clip: cut.prev, localTime: local(cut.prev, time), transition: { type, progress, role: "out" } });
      layers.push({ track, clip: cut.clip, localTime: local(cut.clip, time), transition: { type, progress, role: "in" } });
      continue;
    }
    for (const clip of track.clips) {
      if (isVisual(clip) && isClipActiveAt(clip, time)) layers.push({ track, clip, localTime: time - clip.start });
    }
  }
  return layers;
}

export interface HeldFrame {
  clip: Clip;
  /** Posición en la fuente que debe mostrar el elemento (en pausa). */
  sourceTime: Microseconds;
}

/**
 * Clips de video que deben mostrar un fotograma congelado porque están en la
 * ventana de una transición pero fuera de su propio rango.
 */
export function getHeldFrames(project: Project, time: Microseconds, frameDuration: Microseconds): HeldFrame[] {
  const held: HeldFrame[] = [];
  for (const track of project.tracks) {
    const cut = cutAt(track, time);
    if (!cut) continue;
    if (time >= cut.clip.start && cut.prev.type === "video" && cut.prev.assetId) {
      held.push({ clip: cut.prev, sourceTime: sourceTimeAt(cut.prev, clipEnd(cut.prev) - frameDuration) });
    }
    if (time < cut.clip.start && cut.clip.type === "video" && cut.clip.assetId) {
      held.push({ clip: cut.clip, sourceTime: cut.clip.sourceStart });
    }
  }
  return held;
}
