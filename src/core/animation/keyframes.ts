import type { AnimatableProperty, Clip, Easing, Keyframe, Keyframes, Transform } from "../project/schema";
import type { Microseconds } from "../types/time";

/**
 * Keyframes de la transformación. Los tiempos son relativos al inicio del
 * clip en el timeline. Una propiedad sin keyframes usa su valor estático de
 * `clip.transform`; con keyframes, se interpola entre ellos y fuera del rango
 * se mantiene el valor del extremo.
 */

export const ANIMATABLE_PROPERTIES: readonly AnimatableProperty[] = ["x", "y", "scaleX", "scaleY", "rotation", "opacity"];

const ease: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

export function sortKeyframes(list: readonly Keyframe[]): Keyframe[] {
  return [...list].sort((a, b) => a.time - b.time);
}

/** Valor de una lista de keyframes (ordenada) en `time`. */
export function interpolate(list: readonly Keyframe[], time: Microseconds): number {
  if (list.length === 0) return Number.NaN;
  if (time <= list[0].time) return list[0].value;
  const last = list[list.length - 1];
  if (time >= last.time) return last.value;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = b.time === a.time ? 1 : (time - a.time) / (b.time - a.time);
      return a.value + (b.value - a.value) * ease[a.easing](t);
    }
  }
  return last.value;
}

export function isAnimated(clip: Clip, property: AnimatableProperty): boolean {
  return (clip.keyframes[property]?.length ?? 0) > 0;
}

/** Transformación efectiva del clip en un instante local (relativo a su inicio). */
export function evaluateTransform(clip: Clip, localTime: Microseconds): Transform {
  const result: Transform = { ...clip.transform };
  for (const property of ANIMATABLE_PROPERTIES) {
    const list = clip.keyframes[property];
    if (list && list.length > 0) result[property] = interpolate(list, localTime);
  }
  result.opacity = Math.min(1, Math.max(0, result.opacity));
  result.scaleX = Math.max(0.001, result.scaleX);
  result.scaleY = Math.max(0.001, result.scaleY);
  return result;
}

/** Índice del keyframe "en" `time` (dentro de la tolerancia), o -1. */
export function findKeyframeAt(list: readonly Keyframe[] | undefined, time: Microseconds, tolerance: Microseconds): number {
  if (!list) return -1;
  return list.findIndex((k) => Math.abs(k.time - time) <= tolerance);
}

/** Inserta o actualiza un keyframe (reemplaza el que esté dentro de la tolerancia). */
export function upsertKeyframe(
  keyframes: Keyframes,
  property: AnimatableProperty,
  time: Microseconds,
  value: number,
  tolerance: Microseconds,
  easing: Easing = "linear",
): Keyframes {
  const list = keyframes[property] ?? [];
  const index = findKeyframeAt(list, time, tolerance);
  const next =
    index === -1
      ? sortKeyframes([...list, { time, value, easing }])
      : list.map((k, i) => (i === index ? { ...k, value } : k));
  return { ...keyframes, [property]: next };
}

export function removeKeyframe(
  keyframes: Keyframes,
  property: AnimatableProperty,
  time: Microseconds,
  tolerance: Microseconds,
): Keyframes {
  const list = keyframes[property] ?? [];
  const next = list.filter((k) => Math.abs(k.time - time) > tolerance);
  const result = { ...keyframes, [property]: next };
  if (next.length === 0) delete result[property];
  return result;
}

/** Desplaza todos los keyframes (p. ej. al recortar el inicio del clip). */
export function shiftKeyframes(keyframes: Keyframes, delta: Microseconds): Keyframes {
  if (delta === 0) return keyframes;
  const result: Keyframes = {};
  for (const property of ANIMATABLE_PROPERTIES) {
    const list = keyframes[property];
    if (list) result[property] = list.map((k) => ({ ...k, time: k.time + delta }));
  }
  return result;
}

/**
 * Divide los keyframes en un instante local: cada mitad conserva los suyos y
 * recibe un keyframe en el borde con el valor interpolado, para que la
 * animación no cambie visualmente.
 */
export function splitKeyframes(keyframes: Keyframes, at: Microseconds): { left: Keyframes; right: Keyframes } {
  const left: Keyframes = {};
  const right: Keyframes = {};
  for (const property of ANIMATABLE_PROPERTIES) {
    const list = keyframes[property];
    if (!list || list.length === 0) continue;
    const value = interpolate(list, at);
    const easing = list.findLast((k) => k.time <= at)?.easing ?? "linear";
    const before = list.filter((k) => k.time < at);
    const after = list.filter((k) => k.time > at).map((k) => ({ ...k, time: k.time - at }));
    left[property] = [...before, { time: at, value, easing }];
    right[property] = [{ time: 0, value, easing }, ...after];
  }
  return { left, right };
}

/** Todos los instantes con keyframe (cualquier propiedad), ordenados y sin repetir. */
export function keyframeTimes(clip: Clip): Microseconds[] {
  const times = new Set<Microseconds>();
  for (const property of ANIMATABLE_PROPERTIES) clip.keyframes[property]?.forEach((k) => times.add(k.time));
  return [...times].sort((a, b) => a - b);
}
