import { describe, expect, it } from "vitest";

import {
  clipDurationForAsset,
  countAssetUsage,
  createClipFromAsset,
  findInsertionStart,
  pickTargetTrack,
} from "@/core/media/placement";
import { classifyFile, MEDIA_RULES } from "@/core/media/validation";
import { createClip, createEmptyProject, DEFAULT_STILL_DURATION } from "@/core/project/factory";
import type { MediaAsset } from "@/core/project/schema";
import { secondsToUs } from "@/core/types/time";

const asset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id: "a1",
  projectId: "p1",
  kind: "video",
  name: "playa.mp4",
  mimeType: "video/mp4",
  size: 1000,
  duration: secondsToUs(8),
  width: 1920,
  height: 1080,
  hasAudio: true,
  blobId: "b1",
  createdAt: 0,
  ...overrides,
});

describe("classifyFile", () => {
  it("clasifica por MIME", () => {
    expect(classifyFile({ name: "a.mp4", type: "video/mp4", size: 10 })).toEqual({ ok: true, kind: "video" });
    expect(classifyFile({ name: "a.wav", type: "audio/wav", size: 10 })).toEqual({ ok: true, kind: "audio" });
    expect(classifyFile({ name: "a.png", type: "image/png", size: 10 })).toEqual({ ok: true, kind: "image" });
  });

  it("usa la extensión si el navegador no informa el MIME", () => {
    expect(classifyFile({ name: "Clip.MOV", type: "", size: 10 })).toEqual({ ok: true, kind: "video" });
    expect(classifyFile({ name: "voz.m4a", type: "application/octet-stream", size: 10 })).toEqual({
      ok: true,
      kind: "audio",
    });
  });

  it("rechaza formatos no soportados, archivos vacíos y demasiado grandes", () => {
    expect(classifyFile({ name: "doc.pdf", type: "application/pdf", size: 10 }).ok).toBe(false);
    // Un MIME explícito y desconocido no se reinterpreta por la extensión.
    expect(classifyFile({ name: "falso.mp4", type: "text/plain", size: 10 }).ok).toBe(false);
    expect(classifyFile({ name: "a.png", type: "image/png", size: 0 })).toEqual({
      ok: false,
      reason: "El archivo está vacío.",
    });
    const tooBig = classifyFile({ name: "a.png", type: "image/png", size: MEDIA_RULES.image.maxBytes + 1 });
    expect(tooBig.ok).toBe(false);
    expect(!tooBig.ok && tooBig.reason).toContain("50.0 MB");
  });
});

describe("placement", () => {
  it("elige la pista por defecto según el tipo", () => {
    const project = createEmptyProject({ name: "P" });
    expect(pickTargetTrack(project, "video")?.name).toBe("Video 1");
    expect(pickTargetTrack(project, "image")?.name).toBe("Video 1");
    expect(pickTargetTrack(project, "audio")?.name).toBe("Audio");

    project.tracks[2].locked = true;
    expect(pickTargetTrack(project, "video")?.name).toBe("Video 2");
    project.tracks[3].locked = true;
    expect(pickTargetTrack(project, "audio")).toBeNull();
  });

  it("inserta en el punto pedido si está libre y al final si se solapa", () => {
    const track = createEmptyProject({ name: "P" }).tracks[2];
    track.clips = [createClip({ type: "video", name: "A", start: secondsToUs(2), duration: secondsToUs(3) })];
    expect(findInsertionStart(track, 0, secondsToUs(2))).toBe(0);
    expect(findInsertionStart(track, 0, secondsToUs(2.5))).toBe(secondsToUs(5));
    expect(findInsertionStart(track, secondsToUs(6), secondsToUs(1))).toBe(secondsToUs(6));
    expect(findInsertionStart(track, -50, 10)).toBe(0);
  });

  it("crea clips desde assets con su duración", () => {
    const clip = createClipFromAsset(asset(), 7, { idFactory: () => "c1" });
    expect(clip).toMatchObject({ id: "c1", type: "video", name: "playa", assetId: "a1", start: 7, duration: secondsToUs(8) });
    expect(clipDurationForAsset(asset({ kind: "image", duration: undefined }))).toBe(DEFAULT_STILL_DURATION);
  });

  it("cuenta el uso de un asset", () => {
    const project = createEmptyProject({ name: "P" });
    project.tracks[2].clips = [createClipFromAsset(asset(), 0), createClipFromAsset(asset(), secondsToUs(9))];
    expect(countAssetUsage(project, "a1")).toBe(2);
    expect(countAssetUsage(project, "otro")).toBe(0);
  });
});
