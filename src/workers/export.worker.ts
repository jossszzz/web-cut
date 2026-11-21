/// <reference lib="webworker" />
/**
 * Worker de exportación: compone, codifica y multiplexa el video fuera del
 * hilo principal. Una exportación a la vez; `cancel()` la detiene en el
 * siguiente frame.
 */
import * as Comlink from "comlink";
import { getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, Quality } from "mediabunny";

import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, type ExportQuality } from "@/core/export/settings";
import { canStreamToDisk, clearDiskExports } from "@/features/export/engine/opfs";
import { runExport } from "@/features/export/engine/runExport";
import type {
  AudioCodecId,
  ExportCapabilities,
  ExportJob,
  ExportOutcome,
  ExportProgress,
  VideoCodecId,
} from "@/features/export/types";

/** Por orden de preferencia: H.264 es el que reproduce cualquier dispositivo. */
const VIDEO_CODECS: VideoCodecId[] = ["avc", "hevc", "vp9", "av1"];
const AUDIO_CODECS: AudioCodecId[] = ["aac", "opus"];

let activeJob: string | null = null;
let canceledJob: string | null = null;

const api = {
  async capabilities(options: { width: number; height: number; fps: number; quality: ExportQuality }): Promise<ExportCapabilities> {
    const webCodecs = typeof VideoEncoder !== "undefined" && typeof OffscreenCanvas !== "undefined";
    if (!webCodecs) return { webCodecs, videoCodec: null, audioCodec: null, streamToDisk: false };
    const [videoCodec, audioCodec] = await Promise.all([
      getFirstEncodableVideoCodec(VIDEO_CODECS, {
        width: options.width,
        height: options.height,
        frameRate: options.fps,
        quality: new Quality(options.quality),
      }).catch(() => null),
      typeof AudioEncoder === "undefined"
        ? Promise.resolve(null)
        : getFirstEncodableAudioCodec(AUDIO_CODECS, { numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_SAMPLE_RATE }).catch(
            () => null,
          ),
    ]);
    return {
      webCodecs,
      videoCodec: videoCodec as VideoCodecId | null,
      audioCodec: audioCodec as AudioCodecId | null,
      streamToDisk: canStreamToDisk(),
    };
  },

  async export(job: ExportJob, onProgress: (progress: ExportProgress) => void): Promise<ExportOutcome> {
    if (activeJob) {
      return { ok: false, error: { code: "unknown", message: "Ya hay una exportación en curso." } };
    }
    activeJob = job.id;
    canceledJob = null;
    try {
      if (job.streamToDisk) await clearDiskExports();
      const outcome = await runExport(job, {
        onProgress,
        isCanceled: () => canceledJob === job.id,
      });
      return outcome.ok && outcome.storage === "memory" ? Comlink.transfer(outcome, [outcome.buffer]) : outcome;
    } finally {
      activeJob = null;
    }
  },

  cancel(jobId: string): void {
    if (activeJob === jobId) canceledJob = jobId;
  },

  /** Borra los archivos exportados que queden en OPFS. */
  async clear(): Promise<void> {
    if (!activeJob) await clearDiskExports();
  },
};

export type ExportWorkerApi = typeof api;

Comlink.expose(api);
