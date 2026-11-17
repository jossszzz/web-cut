/**
 * Unidades de tiempo del motor.
 *
 * Internamente todo el tiempo se representa como microsegundos enteros para
 * evitar errores de redondeo acumulados con decimales. Las conversiones a
 * segundos solo se hacen en los bordes (UI, APIs del navegador).
 */
export type Microseconds = number;

export const US_PER_SECOND = 1_000_000;

export function secondsToUs(seconds: number): Microseconds {
  return Math.round(seconds * US_PER_SECOND);
}

export function usToSeconds(us: Microseconds): number {
  return us / US_PER_SECOND;
}

/** Índice del frame que contiene el instante `us`. */
export function usToFrame(us: Microseconds, fps: number): number {
  return Math.floor((us * fps) / US_PER_SECOND + 1e-9);
}

export function frameToUs(frame: number, fps: number): Microseconds {
  return Math.round((frame * US_PER_SECOND) / fps);
}

/** Ajusta un instante al inicio del frame más cercano. */
export function snapToFrame(us: Microseconds, fps: number): Microseconds {
  return frameToUs(Math.round((us * fps) / US_PER_SECOND), fps);
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}

/** Formato `HH:MM:SS:FF`. */
export function formatTimecode(us: Microseconds, fps: number): string {
  const safeUs = Math.max(0, us);
  const roundedFps = Math.round(fps);
  const totalFrames = usToFrame(safeUs, fps);
  const frames = totalFrames % roundedFps;
  const totalSeconds = Math.floor(totalFrames / roundedFps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

/** Formato corto legible, p. ej. `1:05.2`. */
export function formatDuration(us: Microseconds): string {
  const totalTenths = Math.floor(Math.max(0, us) / (US_PER_SECOND / 10));
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${pad(seconds)}.${tenths}`;
}
