/// <reference lib="webworker" />
/**
 * Worker de medios: lee metadatos y genera miniaturas fuera del hilo principal.
 * Usa Mediabunny (demux) + WebCodecs (decodificación) cuando están disponibles.
 * Se comunica con Comlink; recibe `File`/`Blob` (se pasan por referencia, sin copiar el contenido).
 */
import * as Comlink from "comlink";
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";

import { THUMBNAIL_MAX_WIDTH, type ProbeResult } from "@/core/media/probe";
import type { MediaKind } from "@/core/project/schema";
import { secondsToUs } from "@/core/types/time";

async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type: string): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality: 0.82 });
  throw new Error("Canvas sin convertToBlob en el worker");
}

async function probeAv(file: Blob, kind: "video" | "audio"): Promise<ProbeResult> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    const duration = await input.computeDuration();

    if (kind === "audio") {
      if (!audioTrack) throw new Error("Sin pista de audio");
      return { duration: secondsToUs(duration), hasAudio: true };
    }

    if (!videoTrack) throw new Error("Sin pista de video");
    if (!(await videoTrack.canDecode())) throw new Error(`Códec no decodificable: ${videoTrack.codec}`);

    const width = videoTrack.displayWidth;
    const height = videoTrack.displayHeight;
    const sink = new CanvasSink(videoTrack, { width: Math.min(THUMBNAIL_MAX_WIDTH, width) });
    const first = await videoTrack.getFirstTimestamp();
    // Un fotograma algo adelantado suele ser más representativo que el primero (a menudo negro).
    const frame = await sink.getCanvas(first + Math.min(1, duration * 0.1));
    const thumbnail = frame ? await canvasToBlob(frame.canvas, "image/jpeg") : undefined;

    return { duration: secondsToUs(duration), width, height, hasAudio: audioTrack !== null, thumbnail };
  } finally {
    input.dispose();
  }
}

async function probeImage(file: Blob): Promise<ProbeResult> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / width);
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Sin contexto 2D");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // WebP conserva la transparencia y ocupa mucho menos que PNG; los
    // navegadores que no lo codifican devuelven PNG.
    const thumbnail = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
    return { width, height, hasAudio: false, thumbnail };
  } finally {
    bitmap.close();
  }
}

const api = {
  probe(file: Blob, kind: MediaKind): Promise<ProbeResult> {
    return kind === "image" ? probeImage(file) : probeAv(file, kind);
  },
};

export type MediaWorkerApi = typeof api;

Comlink.expose(api);
