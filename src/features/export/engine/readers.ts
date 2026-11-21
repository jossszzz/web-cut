import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, VideoSampleSink, type VideoSample } from "mediabunny";

import { PcmQueue } from "@/core/audio/mixer";
import type { Clip } from "@/core/project/schema";
import { usToSeconds } from "@/core/types/time";

import { ExportFailureError } from "./errors";

/**
 * Lectores secuenciales de medios para la exportación (en el worker). Cada
 * clip abre su propia entrada de Mediabunny y avanza de forma monótona, así
 * cada paquete se decodifica una sola vez.
 */

/** Margen al final del tramo de fuente para no quedarse sin el último frame. */
const SOURCE_TAIL = 0.5;

function sourceRange(clip: Clip) {
  const from = usToSeconds(clip.sourceStart);
  return { from, to: from + usToSeconds(clip.duration) * clip.speed + SOURCE_TAIL };
}

export class VideoClipReader {
  private current: VideoSample | null = null;
  private peeked: VideoSample | null = null;
  private done = false;

  private constructor(
    private readonly input: Input,
    private readonly iterator: AsyncGenerator<VideoSample, void, unknown>,
  ) {}

  static async open(clip: Clip, blob: Blob): Promise<VideoClipReader> {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new ExportFailureError("media", `«${clip.name}» no tiene pista de video.`, clip.id);
      if (!(await track.canDecode())) {
        throw new ExportFailureError(
          "media",
          `Este navegador no puede decodificar el video de «${clip.name}» (${track.codec ?? "códec desconocido"}).`,
          clip.id,
        );
      }
      const { from, to } = sourceRange(clip);
      return new VideoClipReader(input, new VideoSampleSink(track).samples(from, to));
    } catch (error) {
      input.dispose();
      if (error instanceof ExportFailureError) throw error;
      throw new ExportFailureError("media", `No se pudo leer el video de «${clip.name}».`, clip.id, error);
    }
  }

  private async next(): Promise<VideoSample | null> {
    if (this.done) return null;
    const result = await this.iterator.next();
    if (result.done) {
      this.done = true;
      return null;
    }
    return result.value;
  }

  /** Frame que se ve en `time` (segundos de la fuente). Las peticiones deben ser crecientes. */
  async frameAt(time: number): Promise<VideoSample | null> {
    const epsilon = 1e-4;
    if (!this.current) this.current = await this.next();
    while (this.current) {
      if (!this.peeked) this.peeked = await this.next();
      if (!this.peeked || this.peeked.timestamp > time + epsilon) break;
      this.current.close();
      this.current = this.peeked;
      this.peeked = null;
    }
    return this.current;
  }

  close(): void {
    this.current?.close();
    this.peeked?.close();
    this.current = this.peeked = null;
    void this.iterator.return(undefined).catch(() => undefined);
    this.input.dispose();
  }
}

export class AudioClipReader {
  readonly queue = new PcmQueue();
  private done = false;

  private constructor(
    private readonly input: Input,
    private readonly iterator: AsyncGenerator<import("mediabunny").AudioSample, void, unknown>,
  ) {}

  static async open(clip: Clip, blob: Blob): Promise<AudioClipReader> {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track) throw new ExportFailureError("media", `«${clip.name}» no tiene pista de audio.`, clip.id);
      if (!(await track.canDecode())) {
        throw new ExportFailureError(
          "media",
          `Este navegador no puede decodificar el audio de «${clip.name}» (${track.codec ?? "códec desconocido"}).`,
          clip.id,
        );
      }
      const { from, to } = sourceRange(clip);
      return new AudioClipReader(input, new AudioSampleSink(track).samples(from, to));
    } catch (error) {
      input.dispose();
      if (error instanceof ExportFailureError) throw error;
      throw new ExportFailureError("media", `No se pudo leer el audio de «${clip.name}».`, clip.id, error);
    }
  }

  /** Decodifica hasta tener audio de la fuente al menos hasta `time` (segundos). */
  async fillUntil(time: number): Promise<void> {
    while (!this.done && this.queue.end < time) {
      const result = await this.iterator.next();
      if (result.done) {
        this.done = true;
        return;
      }
      const sample = result.value;
      try {
        const channels: Float32Array[] = [];
        for (let c = 0; c < Math.min(2, sample.numberOfChannels); c++) {
          const plane = new Float32Array(sample.numberOfFrames);
          sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
          channels.push(plane);
        }
        this.queue.push({ start: sample.timestamp, sampleRate: sample.sampleRate, channels });
      } finally {
        sample.close();
      }
    }
  }

  close(): void {
    void this.iterator.return(undefined).catch(() => undefined);
    this.input.dispose();
  }
}
