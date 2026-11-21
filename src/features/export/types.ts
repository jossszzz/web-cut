import type { ExportSettings } from "@/core/export/settings";
import type { MediaAsset, Project } from "@/core/project/schema";

/**
 * Contrato entre el hilo principal y el worker de exportación. Solo datos
 * clonables (y transferibles: `ImageBitmap`, `ArrayBuffer`); los `Blob` se
 * pasan por referencia sin copiar su contenido.
 */

export type VideoCodecId = "avc" | "hevc" | "vp9" | "av1";
export type AudioCodecId = "aac" | "opus";

export interface ExportCapabilities {
  /** El navegador expone WebCodecs (VideoEncoder) y OffscreenCanvas en workers. */
  webCodecs: boolean;
  videoCodec: VideoCodecId | null;
  audioCodec: AudioCodecId | null;
  /** Se puede escribir el archivo directamente en disco (OPFS) en vez de en memoria. */
  streamToDisk: boolean;
}

/** Contenido estático prerenderizado en el hilo principal (texto y marcadores). */
export interface StaticLayer {
  clipId: string;
  bitmap: ImageBitmap;
  /** Tamaño del contenido en píxeles del proyecto (sin el margen). */
  width: number;
  height: number;
  /** Margen alrededor del contenido incluido en el bitmap (sombra del texto). */
  pad: number;
}

export interface ExportJob {
  id: string;
  project: Project;
  assets: Record<string, MediaAsset>;
  /** Archivo original de cada asset necesario, por id de asset. */
  blobs: Record<string, Blob>;
  staticLayers: StaticLayer[];
  settings: ExportSettings;
  width: number;
  height: number;
  videoCodec: VideoCodecId;
  audioCodec: AudioCodecId | null;
  /** Escribir en OPFS (si el navegador lo permite) o en memoria. */
  streamToDisk: boolean;
}

export type ExportPhase = "preparing" | "rendering" | "finalizing";

export interface ExportProgress {
  phase: ExportPhase;
  frame: number;
  totalFrames: number;
}

export type ExportErrorCode = "canceled" | "unsupported" | "media" | "storage" | "encoder" | "unknown";

export interface ExportFailure {
  code: ExportErrorCode;
  message: string;
  /** Clip que provocó el error, si se sabe. */
  clipId?: string;
  /** Mensaje técnico original, para la consola. */
  detail?: string;
}

export type ExportOutcome =
  | { ok: true; storage: "disk"; fileName: string; size: number; mimeType: string }
  | { ok: true; storage: "memory"; buffer: ArrayBuffer; size: number; mimeType: string }
  | { ok: false; error: ExportFailure };

/** Carpeta de OPFS donde el worker deja los archivos exportados. */
export const EXPORT_DIRECTORY = "webcut-exports";
