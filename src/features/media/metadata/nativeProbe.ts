import { MediaProbeError, THUMBNAIL_MAX_WIDTH, type ProbeResult } from "@/core/media/probe";
import type { MediaKind } from "@/core/project/schema";
import { secondsToUs } from "@/core/types/time";

const TIMEOUT_MS = 15_000;
const UNSUPPORTED = "El navegador no puede leer este archivo. Prueba con otro formato (p. ej. MP4 H.264 o WebM).";

function once<T extends Event>(target: EventTarget, type: string): Promise<T> {
  return new Promise((resolve) => target.addEventListener(type, (e) => resolve(e as T), { once: true }));
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new MediaProbeError(UNSUPPORTED)), TIMEOUT_MS)),
  ]);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | undefined> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), type, 0.82));
}

async function loadMedia(element: HTMLMediaElement, url: string): Promise<void> {
  element.preload = "metadata";
  element.muted = true;
  element.src = url;
  const result = await Promise.race([once(element, "loadedmetadata"), once(element, "error")]);
  if (result.type === "error") throw new MediaProbeError(UNSUPPORTED);
}

/**
 * Lectura de metadatos con elementos multimedia nativos, en el hilo principal.
 * Se usa como respaldo cuando el worker (WebCodecs/Mediabunny) no puede leer el archivo.
 */
export async function nativeProbe(file: Blob, kind: MediaKind): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      await withTimeout(img.decode().catch(() => Promise.reject(new MediaProbeError(UNSUPPORTED))));
      // Sin miniatura: la biblioteca usará la propia imagen (evita duplicar el archivo).
      return { width: img.naturalWidth, height: img.naturalHeight, hasAudio: false };
    }

    if (kind === "audio") {
      const audio = document.createElement("audio");
      await withTimeout(loadMedia(audio, url));
      if (!Number.isFinite(audio.duration)) throw new MediaProbeError(UNSUPPORTED);
      return { duration: secondsToUs(audio.duration), hasAudio: true };
    }

    const video = document.createElement("video");
    video.playsInline = true;
    await withTimeout(loadMedia(video, url));
    const { videoWidth: width, videoHeight: height, duration } = video;
    if (!width || !height || !Number.isFinite(duration)) throw new MediaProbeError(UNSUPPORTED);

    video.currentTime = Math.min(1, duration * 0.1);
    await withTimeout(once(video, "seeked"));
    const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnail = await canvasToBlob(canvas, "image/jpeg");
    video.removeAttribute("src");
    video.load();

    // Los elementos nativos no indican de forma estándar si hay pista de audio; se asume que sí.
    return { duration: secondsToUs(duration), width, height, hasAudio: true, thumbnail };
  } finally {
    URL.revokeObjectURL(url);
  }
}
