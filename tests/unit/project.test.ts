import { describe, expect, it } from "vitest";

import { createClip, createDemoProject, createEmptyProject } from "@/core/project/factory";
import { findClip, getProjectDuration, getVisualClipsAt } from "@/core/project/queries";
import { projectSchema } from "@/core/project/schema";
import { secondsToUs } from "@/core/types/time";

import { sequentialIds } from "./helpers";

describe("createEmptyProject", () => {
  it("crea un proyecto 1920×1080 a 30 fps con las pistas por defecto", () => {
    const project = createEmptyProject({ name: "  Mi video ", now: 1, idFactory: sequentialIds() });

    expect(project.name).toBe("Mi video");
    expect(project.settings).toEqual({ width: 1920, height: 1080, fps: 30, backgroundColor: "#000000" });
    expect(project.tracks.map((t) => [t.type, t.name])).toEqual([
      ["overlay", "Texto"],
      ["video", "Video 2"],
      ["video", "Video 1"],
      ["audio", "Audio"],
    ]);
    expect(project.tracks.every((t) => t.clips.length === 0)).toBe(true);
    expect(getProjectDuration(project)).toBe(0);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it("usa un nombre por defecto si viene vacío", () => {
    expect(createEmptyProject({ name: "   " }).name).toBe("Proyecto sin título");
  });
});

describe("createDemoProject", () => {
  it("genera clips de prueba válidos sin assets", () => {
    const project = createDemoProject({ name: "Demo" });
    expect(projectSchema.safeParse(project).success).toBe(true);
    const clips = project.tracks.flatMap((t) => t.clips);
    expect(clips.length).toBeGreaterThan(0);
    expect(clips.every((c) => c.assetId === undefined)).toBe(true);
    expect(getProjectDuration(project)).toBe(secondsToUs(11));
  });
});

describe("queries", () => {
  it("encuentra clips y su pista", () => {
    const project = createDemoProject({ name: "Demo", idFactory: sequentialIds() });
    const target = project.tracks[1].clips[0];
    const location = findClip(project, target.id);
    expect(location?.track.id).toBe(project.tracks[1].id);
    expect(location?.trackIndex).toBe(1);
    expect(findClip(project, "no-existe")).toBeNull();
  });

  it("devuelve clips visuales activos en orden de pintado y respeta visibilidad", () => {
    const project = createDemoProject({ name: "Demo" });
    const at3s = getVisualClipsAt(project, secondsToUs(3)).map(({ clip }) => clip.name);
    // De la pista inferior a la superior: Video 1, Video 2, Texto (encima).
    expect(at3s).toEqual(["Toma A", "Logo", "Título"]);

    const hidden = {
      ...project,
      tracks: project.tracks.map((t, i) => (i === 0 ? { ...t, visible: false } : t)),
    };
    expect(getVisualClipsAt(hidden, secondsToUs(3)).map(({ clip }) => clip.name)).toEqual([
      "Toma A",
      "Logo",
    ]);
  });

  it("el final de un clip es exclusivo", () => {
    const project = createEmptyProject({ name: "P" });
    project.tracks[0].clips = [createClip({ type: "video", name: "A", start: 0, duration: 1000 })];
    expect(getVisualClipsAt(project, 999)).toHaveLength(1);
    expect(getVisualClipsAt(project, 1000)).toHaveLength(0);
  });
});
