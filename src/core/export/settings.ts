import { getProjectDuration } from "../project/queries";
import type { Project } from "../project/schema";
import { frameToUs, US_PER_SECOND, type Microseconds } from "../types/time";

/**
 * Ajustes de exportación (funciones puras): tamaño de salida, frames,
 * estimación de tamaño de archivo y nombre del archivo.
 */

export type ExportResolution = "project" | "2160p" | "1080p" | "720p" | "480p";
export type ExportQuality = "low" | "medium" | "high";

export interface ExportSettings {
  resolution: ExportResolution;
  quality: ExportQuality;
  fps: number;
}

export const EXPORT_RESOLUTIONS: ReadonlyArray<{ value: ExportResolution; label: string; lines?: number }> = [
  { value: "project", label: "Del proyecto" },
  { value: "2160p", label: "4K (2160p)", lines: 2160 },
  { value: "1080p", label: "1080p", lines: 1080 },
  { value: "720p", label: "720p", lines: 720 },
  { value: "480p", label: "480p", lines: 480 },
];

export const EXPORT_QUALITIES: ReadonlyArray<{ value: ExportQuality; label: string }> = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja (archivo pequeño)" },
];

export const EXPORT_FPS = [24, 25, 30, 50, 60] as const;

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;

export function defaultExportSettings(project: Project): ExportSettings {
  return { resolution: "project", quality: "high", fps: project.settings.fps };
}

/** Los codificadores H.264 exigen dimensiones pares. */
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/**
 * Tamaño de salida conservando la relación de aspecto del proyecto. Las
 * resoluciones con nombre fijan el lado corto (p. ej. 1080p = 1080 en vertical
 * para 16:9 y en horizontal para 9:16). Nunca se escala por encima del proyecto.
 */
export function computeOutputSize(project: Project, resolution: ExportResolution): { width: number; height: number } {
  const { width, height } = project.settings;
  const preset = EXPORT_RESOLUTIONS.find((r) => r.value === resolution);
  if (!preset?.lines) return { width: even(width), height: even(height) };
  const short = Math.min(width, height);
  const scale = Math.min(1, preset.lines / short);
  return { width: even(width * scale), height: even(height * scale) };
}

/** Resoluciones que tienen sentido para el proyecto (no mayores que él). */
export function availableResolutions(project: Project) {
  const short = Math.min(project.settings.width, project.settings.height);
  return EXPORT_RESOLUTIONS.filter((r) => !r.lines || r.lines < short);
}

/** Número de frames a exportar: cubre la duración completa de la composición. */
export function frameCount(duration: Microseconds, fps: number): number {
  if (duration <= 0) return 0;
  return Math.ceil((duration * fps) / US_PER_SECOND - 1e-9);
}

/** Instante (en el timeline) del frame `index`. */
export function frameTime(index: number, fps: number): Microseconds {
  return frameToUs(index, fps);
}

/** Bits por píxel y frame aproximados de cada calidad (H.264). */
const BITS_PER_PIXEL: Record<ExportQuality, number> = { low: 0.05, medium: 0.1, high: 0.16 };
const AUDIO_BITRATE = 128_000;

/** Tasa de bits aproximada del video, en bits/s. */
export function estimateVideoBitrate(width: number, height: number, fps: number, quality: ExportQuality): number {
  return Math.round(width * height * fps * BITS_PER_PIXEL[quality]);
}

/** Tamaño aproximado del archivo en bytes (orientativo: depende del contenido). */
export function estimateFileSize(project: Project, settings: ExportSettings, withAudio = true): number {
  const { width, height } = computeOutputSize(project, settings.resolution);
  const seconds = getProjectDuration(project) / US_PER_SECOND;
  const bitrate = estimateVideoBitrate(width, height, settings.fps, settings.quality) + (withAudio ? AUDIO_BITRATE : 0);
  return Math.round((bitrate * seconds) / 8);
}

/** Nombre de archivo seguro a partir del nombre del proyecto. */
export function exportFileName(projectName: string, extension = "mp4"): string {
  const base = projectName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "webcut-export"}.${extension}`;
}
