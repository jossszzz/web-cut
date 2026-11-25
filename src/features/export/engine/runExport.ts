import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  type Target,
  type VideoSample,
} from "mediabunny";

import { clampSamples, mixClipInto, sourceRangeFor } from "@/core/audio/mixer";
import { planExport } from "@/core/export/plan";
import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, frameCount, frameTime } from "@/core/export/settings";
import { getVisualLayersAt, MAX_TRANSITION_DURATION, type VisualLayer } from "@/core/playback/composition";
import { sourceTimeAt } from "@/core/playback/schedule";
import { clipEnd, findClip, getProjectDuration } from "@/core/project/queries";
import type { Clip } from "@/core/project/schema";
import { usToSeconds, type Microseconds } from "@/core/types/time";
import { composeFrame, cropRect, drawCroppedImage, measureMedia, type LayerRenderer } from "@/features/render/compositor";

import type { ExportJob, ExportOutcome, ExportProgress } from "../types";
import { ExportFailureError, toExportFailure } from "./errors";
import { openDiskFile, type DiskFile } from "./opfs";
import { AudioClipReader, VideoClipReader } from "./readers";

/**
 * Exportación frame a frame (se ejecuta en el worker):
 *
 * 1. Para cada frame, calcula las capas visibles (mismo código que la
 *    preview), decodifica los frames de video necesarios y compone sobre un
 *    OffscreenCanvas.
 * 2. El canvas se codifica (WebCodecs vía Mediabunny) a la vez que el audio
 *    se mezcla por bloques y se codifica en paralelo.
 * 3. Mediabunny multiplexa ambos en MP4, en disco (OPFS) o en memoria.
 *
 * Todas las llamadas a `add()` respetan la contrapresión del codificador, así
 * que la memoria no crece con la duración del video.
 */

/** Bloque de audio que se mezcla de una vez (≈ 0,25 s). */
const AUDIO_BLOCK_FRAMES = 12_000;
/** El audio va por delante del video como mucho este margen. */
const AUDIO_LEAD_SECONDS = 0.5;
const PROGRESS_INTERVAL_MS = 100;
const MAX_IMAGE_SIDE = 3840;

export interface ExportControl {
  onProgress: (progress: ExportProgress) => void;
  isCanceled: () => boolean;
}

class Canceled extends Error {}

const QUALITY_LEVEL = { low: "low", medium: "medium", high: "high" } as const;

export async function runExport(job: ExportJob, control: ExportControl): Promise<ExportOutcome> {
  const { project, settings, width, height } = job;
  const fps = settings.fps;
  const duration = getProjectDuration(project);
  const totalFrames = frameCount(duration, fps);
  const plan = planExport(project, job.assets);
  const withAudio = job.audioCodec !== null && plan.audioClips.length > 0;

  const videoReaders = new Map<string, VideoClipReader>();
  const audioReaders = new Map<string, AudioClipReader>();
  const images = new Map<string, ImageBitmap>();
  const statics = new Map(job.staticLayers.map((layer) => [layer.clipId, layer]));
  const frames = new Map<string, VideoSample | null>();

  let disk: DiskFile | null = null;
  let output: Output | null = null;
  let stage: "prepare" | "encode" = "prepare";
  let lastProgress = 0;

  const report = (progress: ExportProgress, force = false) => {
    const now = performance.now();
    if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return;
    lastProgress = now;
    control.onProgress(progress);
  };
  const checkCanceled = () => {
    if (control.isCanceled()) throw new Canceled();
  };

  const blobFor = (clip: Clip): Blob => {
    const blob = clip.assetId ? job.blobs[clip.assetId] : undefined;
    if (!blob) throw new ExportFailureError("media", `Falta el archivo de «${clip.name}».`, clip.id);
    return blob;
  };

  try {
    report({ phase: "preparing", frame: 0, totalFrames }, true);
    if (totalFrames === 0) throw new ExportFailureError("unsupported", "El proyecto está vacío: añade clips al timeline.");

    // Imágenes: se decodifican una vez (limitadas a 4K).
    for (const assetId of plan.assetIds) {
      const asset = job.assets[assetId];
      const blob = job.blobs[assetId];
      if (asset?.kind !== "image" || !blob) continue;
      try {
        const large = asset.width && asset.height && Math.max(asset.width, asset.height) > MAX_IMAGE_SIDE;
        images.set(
          assetId,
          large
            ? await createImageBitmap(blob, {
                resizeWidth: Math.round((asset.width! / Math.max(asset.width!, asset.height!)) * MAX_IMAGE_SIDE),
                resizeQuality: "high",
              })
            : await createImageBitmap(blob),
        );
      } catch (error) {
        throw new ExportFailureError("media", `No se pudo leer la imagen «${asset.name}».`, undefined, error);
      }
    }

    // Destino: archivo en OPFS (no ocupa RAM) o buffer en memoria.
    // Si OPFS falla (p. ej. WebKit en navegación privada), se usa la memoria.
    if (job.streamToDisk) {
      try {
        disk = await openDiskFile(`${job.id}.mp4`);
      } catch (error) {
        console.info("[WebCut] No se pudo escribir en disco (OPFS); se exporta en memoria.", error);
      }
    }
    const target: Target = disk ? new StreamTarget(disk.writable, { chunked: true }) : new BufferTarget();
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: disk ? false : "in-memory" }),
      target,
    });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new ExportFailureError("unsupported", "El navegador no ofrece un canvas 2D en el worker.");
    ctx.imageSmoothingQuality = "high";

    const videoSource = new CanvasSource(canvas, {
      codec: job.videoCodec,
      quality: new Quality(QUALITY_LEVEL[settings.quality]),
      keyFrameInterval: 2,
      latencyMode: "quality",
    });
    output.addVideoTrack(videoSource, { frameRate: fps });

    const audioSource = withAudio ? new AudioSampleSource({ codec: job.audioCodec!, quality: new Quality("high") }) : null;
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();
    stage = "encode";

    const renderer: LayerRenderer = {
      measure: (clip) => {
        const layer = statics.get(clip.id);
        if (layer) return { w: layer.width, h: layer.height };
        return measureMedia(project, clip.assetId ? job.assets[clip.assetId] : undefined);
      },
      draw: (c, clip, w, h) => {
        const layer = statics.get(clip.id);
        if (layer) {
          // Texto y marcadores: bitmap prerenderizado (el recorte no aplica al texto).
          if (clip.type === "text") {
            c.drawImage(layer.bitmap, -w / 2 - layer.pad, -h / 2 - layer.pad, w + layer.pad * 2, h + layer.pad * 2);
          } else {
            drawCroppedImage(c, layer.bitmap, clip.crop, w, h);
          }
          return;
        }
        const image = clip.assetId ? images.get(clip.assetId) : undefined;
        if (image) return drawCroppedImage(c, image, clip.crop, w, h);
        const sample = frames.get(clip.id);
        if (sample) {
          const { sx, sy, sw, sh } = cropRect(clip.crop, sample.displayWidth, sample.displayHeight);
          sample.draw(c, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
          return;
        }
        c.fillStyle = "#000000";
        c.fillRect(-w / 2, -h / 2, w, h);
      },
    };

    const frameDuration = (i: number) => frameTime(i + 1, fps) - frameTime(i, fps);

    /** Decodifica los frames de video que necesitan las capas de este instante. */
    const prepareFrames = async (layers: VisualLayer[]) => {
      frames.clear();
      for (const { clip, localTime } of layers) {
        if (clip.type !== "video" || !clip.assetId || !job.assets[clip.assetId]) continue;
        let reader = videoReaders.get(clip.id);
        if (!reader) {
          reader = await VideoClipReader.open(clip, blobFor(clip));
          videoReaders.set(clip.id, reader);
        }
        // En la ventana de una transición el clip puede estar fuera de su rango:
        // se congela en su primer o último frame.
        const local = Math.min(Math.max(0, localTime), Math.max(0, clip.duration - frameDuration(0)));
        frames.set(clip.id, await reader.frameAt(usToSeconds(sourceTimeAt(clip, clip.start + local))));
      }
    };

    /** Libera los lectores de clips que ya no pueden volver a verse. */
    const releaseReaders = (time: Microseconds) => {
      for (const [clipId, reader] of videoReaders) {
        const clip = findClip(project, clipId)?.clip;
        if (!clip || time > clipEnd(clip) + MAX_TRANSITION_DURATION) {
          reader.close();
          videoReaders.delete(clipId);
        }
      }
    };

    // Audio por bloques.
    const totalAudioFrames = Math.ceil(usToSeconds(duration) * AUDIO_SAMPLE_RATE);
    let audioCursor = 0;
    const mixNextBlock = async () => {
      const frameCountInBlock = Math.min(AUDIO_BLOCK_FRAMES, totalAudioFrames - audioCursor);
      const left = new Float32Array(frameCountInBlock);
      const right = new Float32Array(frameCountInBlock);
      const blockStart = audioCursor / AUDIO_SAMPLE_RATE;
      const blockEnd = (audioCursor + frameCountInBlock) / AUDIO_SAMPLE_RATE;

      for (const clip of plan.audioClips) {
        const range = sourceRangeFor(clip, blockStart, blockEnd);
        if (!range) {
          // Terminó: liberar su lector.
          const reader = audioReaders.get(clip.id);
          if (reader && blockStart >= usToSeconds(clipEnd(clip))) {
            reader.close();
            audioReaders.delete(clip.id);
          }
          continue;
        }
        let reader = audioReaders.get(clip.id);
        if (!reader) {
          reader = await AudioClipReader.open(clip, blobFor(clip));
          audioReaders.set(clip.id, reader);
        }
        await reader.fillUntil(range.to + 1 / AUDIO_SAMPLE_RATE);
        mixClipInto([left, right], audioCursor, AUDIO_SAMPLE_RATE, clip, clip.volume, reader.queue);
        reader.queue.discardBefore(range.to - 0.01);
      }
      clampSamples(left);
      clampSamples(right);

      const planar = new Float32Array(frameCountInBlock * AUDIO_CHANNELS);
      planar.set(left, 0);
      planar.set(right, frameCountInBlock);
      const sample = new AudioSample({
        data: planar,
        format: "f32-planar",
        numberOfChannels: AUDIO_CHANNELS,
        sampleRate: AUDIO_SAMPLE_RATE,
        timestamp: blockStart,
      });
      try {
        await audioSource!.add(sample);
      } finally {
        sample.close();
      }
      audioCursor += frameCountInBlock;
    };

    for (let i = 0; i < totalFrames; i++) {
      checkCanceled();
      const time = frameTime(i, fps);
      const layers = getVisualLayersAt(project, time);
      await prepareFrames(layers);
      composeFrame(ctx, project, time, width, height, renderer, layers);
      await videoSource.add(usToSeconds(time), usToSeconds(frameDuration(i)));

      if (audioSource) {
        const limit = Math.min(totalAudioFrames, (usToSeconds(time) + AUDIO_LEAD_SECONDS) * AUDIO_SAMPLE_RATE);
        while (audioCursor < limit) {
          checkCanceled();
          await mixNextBlock();
        }
      }
      releaseReaders(time);
      report({ phase: "rendering", frame: i + 1, totalFrames });
    }
    while (audioSource && audioCursor < totalAudioFrames) {
      checkCanceled();
      await mixNextBlock();
    }

    checkCanceled();
    report({ phase: "finalizing", frame: totalFrames, totalFrames }, true);
    videoSource.close();
    audioSource?.close();
    await output.finalize();
    const mimeType = await output.getMimeType().catch(() => "video/mp4");

    if (disk) {
      const size = await disk.size();
      return { ok: true, storage: "disk", fileName: disk.name, size, mimeType };
    }
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new ExportFailureError("encoder", "El archivo exportado quedó vacío.");
    return { ok: true, storage: "memory", buffer, size: buffer.byteLength, mimeType };
  } catch (error) {
    if (output && output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined);
    }
    await disk?.discard();
    if (error instanceof Canceled) {
      return { ok: false, error: { code: "canceled", message: "Exportación cancelada." } };
    }
    const failure = toExportFailure(error, stage);
    console.error("[WebCut] Error de exportación:", failure.detail ?? failure.message);
    return { ok: false, error: failure };
  } finally {
    for (const reader of videoReaders.values()) reader.close();
    for (const reader of audioReaders.values()) reader.close();
    for (const image of images.values()) image.close();
    for (const layer of job.staticLayers) layer.bitmap.close();
    frames.clear();
  }
}
