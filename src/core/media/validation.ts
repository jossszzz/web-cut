import type { MediaKind } from "../project/schema";

const MB = 1024 * 1024;
const GB = 1024 * MB;

interface KindRule {
  maxBytes: number;
  mimeTypes: readonly string[];
  extensions: readonly string[];
}

/**
 * Formatos aceptados en la importación. Aceptar el contenedor no garantiza que
 * el navegador pueda decodificar el códec: eso se comprueba al leer metadatos.
 */
export const MEDIA_RULES: Record<MediaKind, KindRule> = {
  video: {
    maxBytes: 4 * GB,
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"],
    extensions: ["mp4", "m4v", "webm", "mov", "mkv"],
  },
  audio: {
    maxBytes: 500 * MB,
    mimeTypes: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/wave",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/flac",
      "audio/x-flac",
    ],
    extensions: ["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac"],
  },
  image: {
    maxBytes: 50 * MB,
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    extensions: ["png", "jpg", "jpeg", "webp", "gif"],
  },
};

/** Valor para el atributo `accept` de un `<input type="file">`. */
export const ACCEPT_ATTRIBUTE = Object.values(MEDIA_RULES)
  .flatMap((rule) => [...rule.mimeTypes, ...rule.extensions.map((ext) => `.${ext}`)])
  .join(",");

export interface FileDescriptor {
  name: string;
  type: string;
  size: number;
}

export type ValidationResult = { ok: true; kind: MediaKind } | { ok: false; reason: string };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Determina el tipo de medio por MIME (o por extensión si el navegador no
 * informa el MIME, algo habitual con .mov o .mkv) y valida el tamaño.
 */
export function classifyFile(file: FileDescriptor): ValidationResult {
  const mime = file.type.toLowerCase().split(";")[0].trim();
  const ext = extensionOf(file.name);

  const kinds = Object.keys(MEDIA_RULES) as MediaKind[];
  const kind =
    kinds.find((k) => MEDIA_RULES[k].mimeTypes.includes(mime)) ??
    (mime === "" || mime === "application/octet-stream"
      ? kinds.find((k) => MEDIA_RULES[k].extensions.includes(ext))
      : undefined);

  if (!kind) {
    return { ok: false, reason: "Formato no compatible. Usa video (MP4, WebM, MOV), audio (MP3, WAV, OGG, M4A) o imagen (PNG, JPG, WebP, GIF)." };
  }
  if (file.size === 0) return { ok: false, reason: "El archivo está vacío." };
  const { maxBytes } = MEDIA_RULES[kind];
  if (file.size > maxBytes) {
    return { ok: false, reason: `El archivo supera el máximo de ${formatBytes(maxBytes)} para este tipo.` };
  }
  return { ok: true, kind };
}
