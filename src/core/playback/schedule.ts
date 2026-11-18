import { clipEnd, isClipActiveAt } from "../project/queries";
import type { Clip, Project, Track } from "../project/schema";
import { frameToUs, usToFrame, type Microseconds } from "../types/time";

/**
 * Planificación de la reproducción (funciones puras): qué clips con medio
 * están sonando/visibles en un instante, cuáles hay que precargar y en qué
 * punto de su archivo fuente deben estar.
 */

export interface ActiveMedia {
  clip: Clip;
  track: Track;
  /** Posición esperada dentro del archivo fuente. */
  sourceTime: Microseconds;
}

const hasPlayableMedia = (clip: Clip): boolean =>
  clip.assetId !== undefined && (clip.type === "video" || clip.type === "audio");

export function sourceTimeAt(clip: Clip, time: Microseconds): Microseconds {
  return clip.sourceStart + (time - clip.start);
}

/** Clips de video/audio con medio activos en `time` (en el orden de las pistas). */
export function getMediaClipsAt(project: Project, time: Microseconds): ActiveMedia[] {
  const result: ActiveMedia[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (hasPlayableMedia(clip) && isClipActiveAt(clip, time)) {
        result.push({ clip, track, sourceTime: sourceTimeAt(clip, time) });
      }
    }
  }
  return result;
}

/** Clips que empiezan dentro de la ventana `(time, time + window]`: hay que precargarlos. */
export function getUpcomingMediaClips(project: Project, time: Microseconds, window: Microseconds): Clip[] {
  const result: Clip[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (hasPlayableMedia(clip) && clip.start > time && clip.start <= time + window) result.push(clip);
    }
  }
  return result;
}

/** Inicio del frame que contiene `time` a los fps del proyecto. */
export function frameStart(time: Microseconds, fps: number): Microseconds {
  return frameToUs(usToFrame(time, fps), fps);
}

/** ¿El elemento se ha desviado lo suficiente como para reposicionarlo? */
export function needsResync(actual: Microseconds, expected: Microseconds, tolerance: Microseconds): boolean {
  return Math.abs(actual - expected) > tolerance;
}

/** Clips de medio que no están activos ni próximos y pueden liberarse. */
export function isFarFrom(clip: Clip, time: Microseconds, window: Microseconds): boolean {
  return clipEnd(clip) < time - window || clip.start > time + window;
}
