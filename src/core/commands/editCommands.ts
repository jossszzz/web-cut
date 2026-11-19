import {
  ANIMATABLE_PROPERTIES,
  evaluateTransform,
  findKeyframeAt,
  removeKeyframe,
  splitKeyframes,
  upsertKeyframe,
} from "../animation/keyframes";
import { maxTransitionDuration, previousAdjacent } from "../playback/composition";
import { createId, type IdFactory } from "../project/ids";
import { clipEnd, findClip } from "../project/queries";
import type { AnimatableProperty, Clip, Project, Transform, Transition } from "../project/schema";
import type { Microseconds } from "../types/time";
import type { Command } from "./types";

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function replaceClip(project: Project, clipId: string, next: Clip): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.clips.some((c) => c.id === clipId)
        ? { ...track, clips: track.clips.map((c) => (c.id === clipId ? next : c)) }
        : track,
    ),
  };
}

/** Comando que sustituye un clip completo (antes/después). */
function clipSnapshotCommand(label: string, before: Clip, after: Clip, mergeKey?: string): Command {
  return {
    label,
    mergeKey,
    execute: (p) => replaceClip(p, before.id, after),
    undo: (p) => replaceClip(p, before.id, before),
  };
}

const hasSource = (clip: Clip) => clip.type === "video" || clip.type === "audio";

/* ------------------------------------------------------------------ */
/* Dividir                                                             */
/* ------------------------------------------------------------------ */

/** Divide un clip en `time`. Devuelve las dos mitades o `null` si `time` no cae dentro. */
export function splitClip(clip: Clip, time: Microseconds, idFactory: IdFactory = createId): [Clip, Clip] | null {
  if (time <= clip.start || time >= clipEnd(clip)) return null;
  const offset = time - clip.start;
  const { left: leftKeys, right: rightKeys } = splitKeyframes(clip.keyframes, offset);
  const left: Clip = { ...clip, duration: offset, keyframes: leftKeys };
  const right: Clip = {
    ...clip,
    id: idFactory(),
    start: time,
    duration: clip.duration - offset,
    sourceStart: hasSource(clip) ? clip.sourceStart + Math.round(offset * clip.speed) : clip.sourceStart,
    keyframes: rightKeys,
  };
  delete right.transitionIn;
  return [left, right];
}

/**
 * Divide en `time` los clips indicados (o, si no se indica ninguno, todos los
 * que estén bajo el playhead en pistas desbloqueadas).
 */
export function splitClipsCommand(
  project: Project,
  time: Microseconds,
  clipIds?: readonly string[],
  idFactory: IdFactory = createId,
): { command: Command; rightIds: string[] } | null {
  const targets = (clipIds && clipIds.length > 0
    ? clipIds.map((id) => findClip(project, id)).filter((l) => l !== null)
    : project.tracks.flatMap((track, trackIndex) =>
        track.clips.map((clip, clipIndex) => ({ track, trackIndex, clip, clipIndex })),
      )
  ).filter((l) => !l.track.locked && time > l.clip.start && time < clipEnd(l.clip));

  if (targets.length === 0) return null;
  const pieces = targets.map((l) => ({ trackId: l.track.id, original: l.clip, halves: splitClip(l.clip, time, idFactory)! }));

  const apply = (p: Project, forward: boolean): Project => ({
    ...p,
    tracks: p.tracks.map((track) => {
      const mine = pieces.filter((piece) => piece.trackId === track.id);
      if (mine.length === 0) return track;
      let clips = track.clips;
      for (const { original, halves } of mine) {
        clips = forward
          ? clips.flatMap((c) => (c.id === original.id ? halves : [c]))
          : clips.filter((c) => c.id !== halves[1].id).map((c) => (c.id === original.id ? original : c));
      }
      return { ...track, clips };
    }),
  });

  return {
    command: {
      label: pieces.length === 1 ? "Dividir clip" : `Dividir ${pieces.length} clips`,
      execute: (p) => apply(p, true),
      undo: (p) => apply(p, false),
    },
    rightIds: pieces.map((piece) => piece.halves[1].id),
  };
}

/* ------------------------------------------------------------------ */
/* Transformación con keyframes                                        */
/* ------------------------------------------------------------------ */

export interface KeyframeContext {
  /** Instante del timeline en el que se edita (playhead). */
  time: Microseconds;
  /** Tolerancia para considerar que hay un keyframe "en" ese instante (medio frame). */
  tolerance: Microseconds;
}

/**
 * Cambia valores de la transformación. Si una propiedad está animada, crea o
 * actualiza el keyframe en el instante actual; si no, cambia el valor estático.
 */
export function setTransformCommand(
  project: Project,
  clipId: string,
  values: Partial<Transform>,
  { time, tolerance }: KeyframeContext,
  options: { label?: string; mergeKey?: string } = {},
): Command | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return null;
  const { clip } = location;
  const local = time - clip.start;

  let keyframes = clip.keyframes;
  const staticValues: Partial<Transform> = {};
  for (const property of ANIMATABLE_PROPERTIES) {
    const value = values[property];
    if (value === undefined) continue;
    if ((keyframes[property]?.length ?? 0) > 0) {
      keyframes = upsertKeyframe(keyframes, property, local, value, tolerance);
    } else {
      staticValues[property] = value;
    }
  }
  const after: Clip = { ...clip, transform: { ...clip.transform, ...staticValues }, keyframes };
  return clipSnapshotCommand(options.label ?? "Editar transformación", clip, after, options.mergeKey);
}

/**
 * Activa/desactiva keyframes de un grupo de propiedades en el instante actual.
 * Si ya hay keyframe en la primera propiedad, se eliminan; si no, se crean con
 * el valor actual (interpolado o estático).
 */
export function toggleKeyframeCommand(
  project: Project,
  clipId: string,
  properties: readonly AnimatableProperty[],
  { time, tolerance }: KeyframeContext,
): Command | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked || properties.length === 0) return null;
  const { clip } = location;
  const local = time - clip.start;
  if (local < 0 || local > clip.duration) return null;

  const exists = findKeyframeAt(clip.keyframes[properties[0]], local, tolerance) !== -1;
  const current = evaluateTransform(clip, local);
  let keyframes = clip.keyframes;
  let transform = clip.transform;
  for (const property of properties) {
    if (exists) {
      const remaining = removeKeyframe(keyframes, property, local, tolerance);
      // Al quitar el último keyframe, el valor actual pasa a ser el estático.
      if (!remaining[property]) transform = { ...transform, [property]: current[property] };
      keyframes = remaining;
    } else {
      keyframes = upsertKeyframe(keyframes, property, local, current[property], tolerance);
    }
  }
  return clipSnapshotCommand(exists ? "Quitar keyframe" : "Añadir keyframe", clip, { ...clip, keyframes, transform });
}

/* ------------------------------------------------------------------ */
/* Velocidad                                                           */
/* ------------------------------------------------------------------ */

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

/**
 * Cambia la velocidad conservando el tramo de fuente: la duración en el
 * timeline cambia en proporción. Si chocaría con el clip siguiente, se acorta
 * hasta él. Los keyframes se escalan para seguir al contenido.
 */
export function setClipSpeedCommand(project: Project, clipId: string, speed: number): Command | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked || !hasSource(location.clip)) return null;
  const { clip, track } = location;
  const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed * 100) / 100));
  if (next === clip.speed) return null;

  const ratio = clip.speed / next;
  const nextStart = Math.min(
    Number.POSITIVE_INFINITY,
    ...track.clips.filter((c) => c.id !== clip.id && c.start >= clipEnd(clip)).map((c) => c.start),
  );
  const duration = Math.max(1, Math.min(Math.round(clip.duration * ratio), nextStart - clip.start));
  const keyframes = Object.fromEntries(
    Object.entries(clip.keyframes).map(([property, list]) => [
      property,
      list.map((k) => ({ ...k, time: Math.round(k.time * ratio) })),
    ]),
  );
  return clipSnapshotCommand(`Velocidad ${next}×`, clip, { ...clip, speed: next, duration, keyframes });
}

/* ------------------------------------------------------------------ */
/* Transiciones                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pone (o quita con `null`) la transición de entrada de un clip. Requiere un
 * clip visual adyacente antes en la misma pista; la duración se limita.
 */
export function setTransitionCommand(project: Project, clipId: string, transition: Transition | null): Command | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return null;
  const { clip, track } = location;
  if (transition === null) {
    if (!clip.transitionIn) return null;
    const after = { ...clip };
    delete after.transitionIn;
    return clipSnapshotCommand("Quitar transición", clip, after);
  }
  const prev = previousAdjacent(track, clip);
  if (!prev || clip.type === "audio" || prev.type === "audio") return null;
  const duration = Math.max(1, Math.min(transition.duration, maxTransitionDuration(prev, clip)));
  return clipSnapshotCommand("Transición", clip, { ...clip, transitionIn: { type: transition.type, duration } });
}

/* ------------------------------------------------------------------ */
/* Recortar hasta el playhead                                          */
/* ------------------------------------------------------------------ */

/** Tiempos resultantes de eliminar la parte izquierda o derecha de un clip en `time`. */
export function trimAtTime(clip: Clip, time: Microseconds, side: "left" | "right") {
  if (time <= clip.start || time >= clipEnd(clip)) return null;
  if (side === "right") return { start: clip.start, duration: time - clip.start, sourceStart: clip.sourceStart };
  const offset = time - clip.start;
  return {
    start: time,
    duration: clip.duration - offset,
    sourceStart: hasSource(clip) ? clip.sourceStart + Math.round(offset * clip.speed) : clip.sourceStart,
  };
}

/** Restablece la transformación y elimina su animación. */
export function resetTransformCommand(project: Project, clipId: string, transform: Transform): Command | null {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return null;
  const { clip } = location;
  return clipSnapshotCommand("Restablecer transformación", clip, { ...clip, transform, keyframes: {} });
}

/** Normaliza un ángulo a (-180, 180]. */
export function normalizeRotation(degrees: number): number {
  const r = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}
