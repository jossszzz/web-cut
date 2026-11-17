import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/core/project/factory";
import {
  DEFAULT_TIMELINE_LAYOUT as L,
  MAX_PX_PER_SECOND,
  MIN_PX_PER_SECOND,
  getClipCenter,
  getRulerTickSteps,
  hitTest,
  timeToX,
  trackTop,
  xToTime,
  zoomAround,
} from "@/core/timeline/geometry";
import { secondsToUs } from "@/core/types/time";

const vp = { pxPerSecond: 100, scrollX: 0 };

describe("timeline geometry", () => {
  it("convierte tiempo ↔ x de forma reversible y con scroll", () => {
    expect(timeToX(secondsToUs(2), vp)).toBe(200);
    expect(xToTime(200, vp)).toBe(secondsToUs(2));
    const scrolled = { pxPerSecond: 100, scrollX: 150 };
    expect(timeToX(secondsToUs(2), scrolled)).toBe(50);
    expect(xToTime(50, scrolled)).toBe(secondsToUs(2));
    expect(xToTime(-500, vp)).toBe(0);
  });

  it("detecta regla, clips, pistas vacías y huecos", () => {
    const project = createDemoProject({ name: "Demo" });
    expect(hitTest(project, 10, 5, vp)).toEqual({ kind: "ruler" });

    // Video 1 (índice 2) empieza en 0 s.
    expect(hitTest(project, 50, trackTop(2) + 10, vp)).toEqual({
      kind: "clip",
      trackId: project.tracks[2].id,
      clipId: project.tracks[2].clips[0].id,
    });
    // Texto (índice 0) empieza en 1 s: a 0,5 s se golpea la pista.
    expect(hitTest(project, 50, trackTop(0) + 10, vp)).toEqual({ kind: "track", trackId: project.tracks[0].id });
    // Video 2 tiene un clip de 2 s a 8 s; en 1 s está vacía.
    expect(hitTest(project, 100, trackTop(1) + 10, vp)).toEqual({ kind: "track", trackId: project.tracks[1].id });
    // Hueco entre pistas.
    expect(hitTest(project, 100, trackTop(1) - L.trackGap / 2, vp)).toEqual({ kind: "empty" });
    // Debajo de la última pista.
    expect(hitTest(project, 100, trackTop(10), vp)).toEqual({ kind: "empty" });
  });

  it("calcula el centro de un clip consistente con hitTest", () => {
    const project = createDemoProject({ name: "Demo" });
    const clip = project.tracks[2].clips[0];
    const center = getClipCenter(project, clip.id, vp)!;
    expect(hitTest(project, center.x, center.y, vp)).toMatchObject({ kind: "clip", clipId: clip.id });
  });

  it("elige marcas de regla legibles", () => {
    expect(getRulerTickSteps(100)).toEqual({ major: 1, minor: 0.2 });
    expect(getRulerTickSteps(10).major).toBe(10);
    expect(getRulerTickSteps(400).major).toBe(0.25);
  });

  it("hace zoom manteniendo el ancla y respetando los límites", () => {
    const zoomed = zoomAround({ pxPerSecond: 100, scrollX: 0 }, 2, 300);
    expect(zoomed.pxPerSecond).toBe(200);
    expect(xToTime(300, zoomed)).toBe(xToTime(300, vp));
    expect(zoomAround(vp, 1000, 0).pxPerSecond).toBe(MAX_PX_PER_SECOND);
    expect(zoomAround(vp, 0.0001, 0).pxPerSecond).toBe(MIN_PX_PER_SECOND);
  });
});
