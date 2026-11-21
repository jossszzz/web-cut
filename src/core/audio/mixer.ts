import type { Clip } from "../project/schema";
import { usToSeconds } from "../types/time";

/**
 * Mezcla de audio por bloques (funciones puras, sin Web Audio).
 *
 * Cada clip lee su audio decodificado de una `PcmQueue` (fragmentos PCM con
 * marca de tiempo en la fuente) y se remuestrea a la frecuencia de salida con
 * interpolación lineal. La velocidad del clip multiplica el avance en la
 * fuente, así que también cambia el tono (no hay corrección de tono).
 */

export interface PcmChunk {
  /** Instante de la fuente del primer frame, en segundos. */
  start: number;
  sampleRate: number;
  /** Un array por canal (1 = mono, 2 = estéreo). Todos con la misma longitud. */
  channels: Float32Array[];
}

const chunkFrames = (chunk: PcmChunk) => chunk.channels[0]?.length ?? 0;
const chunkEnd = (chunk: PcmChunk) => chunk.start + chunkFrames(chunk) / chunk.sampleRate;

/** Cola de fragmentos PCM ordenados por tiempo. Las lecturas deben ser (casi) monótonas. */
export class PcmQueue {
  private chunks: PcmChunk[] = [];
  private cursor = 0;

  push(chunk: PcmChunk): void {
    if (chunkFrames(chunk) === 0) return;
    this.chunks.push(chunk);
  }

  /** Fin (en segundos de la fuente) del audio disponible; `-Infinity` si está vacía. */
  get end(): number {
    const last = this.chunks.at(-1);
    return last ? chunkEnd(last) : Number.NEGATIVE_INFINITY;
  }

  get size(): number {
    return this.chunks.length;
  }

  private find(time: number): number {
    const { chunks } = this;
    if (chunks.length === 0) return -1;
    let i = Math.min(this.cursor, chunks.length - 1);
    if (time < chunks[i].start) i = 0;
    while (i < chunks.length && time >= chunkEnd(chunks[i])) i++;
    if (i >= chunks.length || time < chunks[i].start) return -1;
    this.cursor = i;
    return i;
  }

  /** Valor interpolado de un canal en `time`. Los huecos se tratan como silencio. */
  sample(channel: number, time: number): number {
    const index = this.find(time);
    if (index === -1) return 0;
    const chunk = this.chunks[index];
    const data = chunk.channels[Math.min(channel, chunk.channels.length - 1)];
    const position = (time - chunk.start) * chunk.sampleRate;
    const i = Math.floor(position);
    const frac = position - i;
    const s0 = data[i] ?? 0;
    let s1: number;
    if (i + 1 < data.length) s1 = data[i + 1];
    else {
      const next = this.chunks[index + 1];
      const contiguous = next && Math.abs(next.start - chunkEnd(chunk)) < 1 / chunk.sampleRate;
      s1 = contiguous ? next.channels[Math.min(channel, next.channels.length - 1)][0] : s0;
    }
    return s0 + (s1 - s0) * frac;
  }

  /** Libera los fragmentos que terminan antes de `time`. */
  discardBefore(time: number): void {
    let drop = 0;
    while (drop < this.chunks.length - 1 && chunkEnd(this.chunks[drop]) <= time) drop++;
    if (drop > 0) {
      this.chunks.splice(0, drop);
      this.cursor = Math.max(0, this.cursor - drop);
    }
  }
}

/** Rampa de entrada/salida en los bordes del clip para evitar chasquidos. */
export const EDGE_FADE_SECONDS = 0.004;

/** Tramo de la fuente (en segundos) que necesita el clip para cubrir el bloque de salida. */
export function sourceRangeFor(clip: Clip, blockStart: number, blockEnd: number): { from: number; to: number } | null {
  const start = usToSeconds(clip.start);
  const end = usToSeconds(clip.start + clip.duration);
  const from = Math.max(blockStart, start);
  const to = Math.min(blockEnd, end);
  if (to <= from) return null;
  const source = usToSeconds(clip.sourceStart);
  return { from: source + (from - start) * clip.speed, to: source + (to - start) * clip.speed };
}

/**
 * Suma el audio de un clip al bloque de salida `[L, R]`, que empieza en el
 * frame `blockStartFrame` (a `sampleRate`). `gain` es el volumen del clip.
 */
export function mixClipInto(
  output: [Float32Array, Float32Array],
  blockStartFrame: number,
  sampleRate: number,
  clip: Clip,
  gain: number,
  queue: PcmQueue,
): void {
  const frames = output[0].length;
  const start = usToSeconds(clip.start);
  const end = usToSeconds(clip.start + clip.duration);
  const source = usToSeconds(clip.sourceStart);
  const first = Math.max(0, Math.ceil(start * sampleRate - blockStartFrame - 1e-9));
  const last = Math.min(frames, Math.ceil(end * sampleRate - blockStartFrame - 1e-9));
  const fadeFrames = EDGE_FADE_SECONDS * sampleRate;

  for (let k = first; k < last; k++) {
    const t = (blockStartFrame + k) / sampleRate;
    const s = source + (t - start) * clip.speed;
    const edge = Math.min((t - start) * sampleRate, (end - t) * sampleRate);
    const g = edge < fadeFrames ? gain * Math.max(0, edge / fadeFrames) : gain;
    output[0][k] += g * queue.sample(0, s);
    output[1][k] += g * queue.sample(1, s);
  }
}

/** Limita las muestras a [-1, 1] (la suma de varios clips puede saturar). */
export function clampSamples(buffer: Float32Array): void {
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i];
    if (v > 1) buffer[i] = 1;
    else if (v < -1) buffer[i] = -1;
  }
}
