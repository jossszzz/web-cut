import type { MediaKind } from "../project/schema";
import type { Microseconds } from "../types/time";

/** Resultado de leer los metadatos de un archivo y generar su miniatura. */
export interface ProbeResult {
  duration?: Microseconds;
  width?: number;
  height?: number;
  hasAudio: boolean;
  /** JPEG/PNG de hasta 640 px de ancho, o ausente (p. ej. audio). */
  thumbnail?: Blob;
}

export type MediaProbe = (file: Blob, kind: MediaKind) => Promise<ProbeResult>;

/** Error esperado al leer un medio, con mensaje apto para el usuario. */
export class MediaProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaProbeError";
  }
}

export const THUMBNAIL_MAX_WIDTH = 640;
