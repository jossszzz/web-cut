import { describe, expect, it } from "vitest";

import { clampSamples, mixClipInto, PcmQueue, sourceRangeFor } from "@/core/audio/mixer";
import { isBlocking, planExport } from "@/core/export/plan";
import {
  availableResolutions,
  computeOutputSize,
  estimateFileSize,
  exportFileName,
  frameCount,
  frameTime,
} from "@/core/export/settings";
import { createClip, createEmptyProject } from "@/core/project/factory";
import type { Clip, MediaAsset, Project } from "@/core/project/schema";
import { secondsToUs as s } from "@/core/types/time";

function project(width = 1920, height = 1080): Project {
  const p = createEmptyProject({ name: "Exportar" });
  return { ...p, settings: { ...p.settings, width, height } };
}

function withClips(p: Project, trackType: "video" | "audio" | "overlay", clips: Clip[]): Project {
  const index = p.tracks.findIndex((t) => t.type === trackType);
  return { ...p, tracks: p.tracks.map((t, i) => (i === index ? { ...t, clips } : t)) };
}

const asset = (id: string, kind: MediaAsset["kind"], hasAudio = false): MediaAsset => ({
  id,
  projectId: "p",
  kind,
  name: id,
  mimeType: "video/mp4",
  size: 1,
  duration: s(10),
  width: 1280,
  height: 720,
  hasAudio,
  blobId: `blob-${id}`,
  createdAt: 0,
});

describe("ajustes de exportación", () => {
  it("calcula el tamaño de salida con dimensiones pares y sin ampliar", () => {
    expect(computeOutputSize(project(), "project")).toEqual({ width: 1920, height: 1080 });
    expect(computeOutputSize(project(), "720p")).toEqual({ width: 1280, height: 720 });
    expect(computeOutputSize(project(), "480p")).toEqual({ width: 854, height: 480 });
    // Vertical 9:16: 720p fija el lado corto (el ancho).
    expect(computeOutputSize(project(1080, 1920), "720p")).toEqual({ width: 720, height: 1280 });
    // Nunca por encima del proyecto.
    expect(computeOutputSize(project(1280, 720), "1080p")).toEqual({ width: 1280, height: 720 });
    expect(availableResolutions(project(1280, 720)).map((r) => r.value)).toEqual(["project", "480p"]);
  });

  it("cuenta los frames que cubren toda la duración", () => {
    expect(frameCount(s(11), 30)).toBe(330);
    expect(frameCount(s(4.004), 30)).toBe(121);
    expect(frameCount(0, 30)).toBe(0);
    expect(frameTime(30, 30)).toBe(s(1));
  });

  it("estima el tamaño y genera un nombre de archivo seguro", () => {
    const p = withClips(project(), "video", [createClip({ type: "video", name: "a", start: 0, duration: s(10) })]);
    const high = estimateFileSize(p, { resolution: "project", quality: "high", fps: 30 });
    const low = estimateFileSize(p, { resolution: "720p", quality: "low", fps: 30 });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(1_000_000);
    expect(exportFileName("Mi vídeo: versión 2/final")).toBe("Mi-video-version-2final.mp4");
    expect(exportFileName("???")).toBe("webcut-export.mp4");
  });
});

describe("plan de exportación", () => {
  it("separa clips de video y de audio audible y avisa de problemas", () => {
    const video = createClip({ type: "video", name: "Toma", start: 0, duration: s(2), assetId: "v" });
    const silentVideo = createClip({ type: "video", name: "Muda", start: s(2), duration: s(2), assetId: "m" });
    const missing = createClip({ type: "video", name: "Perdida", start: s(4), duration: s(1), assetId: "x" });
    const music = { ...createClip({ type: "audio", name: "Música", start: 0, duration: s(5), assetId: "a" }), volume: 0.5 };
    const muted = { ...createClip({ type: "audio", name: "Cero", start: 0, duration: s(5), assetId: "a" }), volume: 0 };
    let p = withClips(project(), "video", [video, silentVideo, missing]);
    p = withClips(p, "audio", [music, muted]);
    const plan = planExport(p, { v: asset("v", "video", true), m: asset("m", "video"), a: asset("a", "audio") });

    expect(plan.videoClips.map((c) => c.name)).toEqual(["Toma", "Muda"]);
    expect(plan.audioClips.map((c) => c.name)).toEqual(["Toma", "Música"]);
    expect(plan.assetIds.sort()).toEqual(["a", "m", "v"]);
    expect(plan.issues).toEqual([{ kind: "missing-media", clipIds: [missing.id], clipNames: ["Perdida"] }]);
  });

  it("una pista silenciada no aporta audio y un proyecto vacío bloquea", () => {
    const music = createClip({ type: "audio", name: "Música", start: 0, duration: s(5), assetId: "a" });
    const p = withClips(project(), "audio", [music]);
    const muted = { ...p, tracks: p.tracks.map((t) => (t.type === "audio" ? { ...t, muted: true } : t)) };
    expect(planExport(muted, { a: asset("a", "audio") }).audioClips).toEqual([]);
    const empty = planExport(project(), {});
    expect(empty.issues.some(isBlocking)).toBe(true);
  });
});

describe("mezcla de audio", () => {
  const RATE = 1000;
  const ramp = (n: number, from = 0) => Float32Array.from({ length: n }, (_, i) => (from + i) / 1000);

  it("interpola entre fragmentos contiguos y trata los huecos como silencio", () => {
    const queue = new PcmQueue();
    queue.push({ start: 0, sampleRate: RATE, channels: [ramp(10)] });
    queue.push({ start: 0.01, sampleRate: RATE, channels: [ramp(10, 10)] });
    expect(queue.sample(0, 0.0045)).toBeCloseTo(0.0045, 6);
    expect(queue.sample(0, 0.0095)).toBeCloseTo(0.0095, 6); // cruza al fragmento siguiente
    expect(queue.sample(1, 0.002)).toBeCloseTo(0.002, 6); // mono → ambos canales
    expect(queue.sample(0, 0.5)).toBe(0);
    queue.discardBefore(0.015);
    expect(queue.size).toBe(1);
    expect(queue.end).toBeCloseTo(0.02, 9);
  });

  it("coloca el clip en su sitio del timeline, aplica volumen y velocidad", () => {
    const queue = new PcmQueue();
    queue.push({ start: 0, sampleRate: RATE, channels: [new Float32Array(10_000).fill(0.5)] });
    const clip = { ...createClip({ type: "audio", name: "a", start: s(1), duration: s(1), assetId: "a" }), speed: 2 };
    const left = new Float32Array(3 * RATE);
    const right = new Float32Array(3 * RATE);
    mixClipInto([left, right], 0, RATE, clip, 0.5, queue);
    expect(left[500]).toBe(0); // antes del clip
    expect(left[1500]).toBeCloseTo(0.25, 6); // 0,5 × volumen 0,5
    expect(right[1500]).toBeCloseTo(0.25, 6);
    expect(left[1000]).toBe(0); // rampa anti-chasquido en el borde
    expect(left[2500]).toBe(0); // después del clip
    // A velocidad 2 el segundo de timeline consume 2 s de fuente.
    expect(sourceRangeFor(clip, 0, 3)).toEqual({ from: 0, to: 2 });
    expect(sourceRangeFor(clip, 1.5, 1.75)).toEqual({ from: 1, to: 1.5 });
    expect(sourceRangeFor(clip, 2.5, 3)).toBeNull();
  });

  it("limita la suma a [-1, 1]", () => {
    const buffer = Float32Array.from([1.5, -2, 0.3]);
    clampSamples(buffer);
    expect(Array.from(buffer)).toEqual([1, -1, Math.fround(0.3)]);
  });
});

describe("errores de exportación", () => {
  it("traduce los errores a mensajes recuperables", async () => {
    const { ExportFailureError, toExportFailure } = await import("@/features/export/engine/errors");
    const media = toExportFailure(new ExportFailureError("media", "Falta el archivo de «A».", "clip-a"), "encode");
    expect(media).toMatchObject({ code: "media", clipId: "clip-a" });
    expect(toExportFailure(new DOMException("full", "QuotaExceededError"), "encode").code).toBe("storage");
    expect(toExportFailure(new Error("EncodingError"), "encode").code).toBe("encoder");
    expect(toExportFailure(new Error("x"), "prepare").code).toBe("unknown");
  });
});
