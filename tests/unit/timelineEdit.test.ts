import { describe, expect, it } from "vitest";

import {
  addTrackCommand,
  defaultTrackIndex,
  moveClipsCommand,
  moveTrackCommand,
  nextTrackName,
  removeTrackCommand,
  setClipTimingCommand,
} from "@/core/commands/timelineCommands";
import { createClip, createEmptyProject } from "@/core/project/factory";
import { findClip } from "@/core/project/queries";
import type { Clip, Project } from "@/core/project/schema";
import { freeGaps, isRangeFree, nearestFreeStart, resolveMove, resolveTrim } from "@/core/timeline/edit";
import { clipsInRect, DEFAULT_TIMELINE_LAYOUT as L, normalizeRect, trackIndexAtY, trackTop } from "@/core/timeline/geometry";
import { collectSnapPoints, snapEdges, snapThresholdUs } from "@/core/timeline/snapping";
import { frameToUs, secondsToUs as s } from "@/core/types/time";

import { sequentialIds } from "./helpers";

const ids = sequentialIds("c");
const clip = (type: Clip["type"], name: string, start: number, duration: number, extra: Partial<Clip> = {}) => ({
  ...createClip({ type, name, start: s(start), duration: s(duration) }, { idFactory: ids }),
  ...extra,
});

/** Texto | Video 2 | Video 1: [A 0-2] [B 4-6] | Audio: [M 0-10] */
function setup(): { project: Project; A: Clip; B: Clip; M: Clip; logo: Clip } {
  const project = createEmptyProject({ name: "T", idFactory: sequentialIds("t") });
  const A = clip("video", "A", 0, 2);
  const B = clip("video", "B", 4, 2, { sourceStart: s(1) });
  const M = clip("audio", "M", 0, 10);
  const logo = clip("image", "Logo", 1, 3);
  project.tracks[2].clips = [A, B];
  project.tracks[3].clips = [M];
  project.tracks[1].clips = [logo];
  return { project, A, B, M, logo };
}

const where = (p: Project, id: string) => {
  const loc = findClip(p, id)!;
  return { track: loc.track.name, start: loc.clip.start, duration: loc.clip.duration, sourceStart: loc.clip.sourceStart };
};

describe("huecos y colisiones", () => {
  it("calcula huecos libres", () => {
    const { project } = setup();
    expect(freeGaps(project.tracks[2])).toEqual([
      { start: s(2), end: s(4) },
      { start: s(6), end: Number.POSITIVE_INFINITY },
    ]);
  });

  it("detecta solapes ignorando los clips indicados", () => {
    const { project, A } = setup();
    const track = project.tracks[2];
    expect(isRangeFree(track, s(2), s(4))).toBe(true);
    expect(isRangeFree(track, s(1), s(3))).toBe(false);
    expect(isRangeFree(track, s(1), s(3), new Set([A.id]))).toBe(true);
    expect(isRangeFree(track, -1, s(1), new Set([A.id]))).toBe(false);
  });

  it("encuentra el inicio libre más cercano", () => {
    const { project, A } = setup();
    const track = project.tracks[2];
    const ignore = new Set([A.id]);
    expect(nearestFreeStart(track, s(1), s(2), ignore)).toBe(s(1)); // cabe donde se pide
    expect(nearestFreeStart(track, s(3), s(2), ignore)).toBe(s(2)); // se ajusta al hueco anterior
    expect(nearestFreeStart(track, s(5.5), s(2), ignore)).toBe(s(6)); // tras B
    expect(nearestFreeStart(track, s(3), s(5), ignore)).toBe(s(6)); // no cabe antes de B
  });
});

describe("resolveMove", () => {
  it("mueve un clip en el tiempo sin bajar de 0", () => {
    const { project, B } = setup();
    expect(resolveMove(project, { clipIds: [B.id], deltaTime: s(2), trackOffset: 0 })).toEqual({
      moves: [{ clipId: B.id, toTrackId: project.tracks[2].id, start: s(6) }],
      snappedTo: null,
    });
    const left = resolveMove(project, { clipIds: [B.id], deltaTime: -s(10), trackOffset: 0 })!;
    expect(left.moves[0].start).toBe(s(2)); // 0 está ocupado por A: hueco libre más cercano
  });

  it("cambia de pista solo si es compatible", () => {
    const { project, A, M } = setup();
    // Video 1 → Video 2 (arriba): permitido.
    expect(resolveMove(project, { clipIds: [A.id], deltaTime: s(5), trackOffset: -1 })!.moves[0]).toMatchObject({
      toTrackId: project.tracks[1].id,
      start: s(5),
    });
    // Video → Audio: incompatible, se queda en su pista.
    expect(resolveMove(project, { clipIds: [A.id], deltaTime: s(7), trackOffset: 1 })!.moves[0].toTrackId).toBe(
      project.tracks[2].id,
    );
    // Audio fuera del timeline (no hay pista debajo): se queda en su pista.
    expect(resolveMove(project, { clipIds: [M.id], deltaTime: 0, trackOffset: 1 })!.moves[0].toTrackId).toBe(
      project.tracks[3].id,
    );
  });

  it("imanta a bordes cercanos", () => {
    const { project, B } = setup();
    const points = collectSnapPoints(project, { excludeClipIds: new Set([B.id]), playhead: s(9) });
    const threshold = s(0.1);
    // Fin de B (6 s + 2.95) cerca del playhead (9 s).
    const result = resolveMove(project, { clipIds: [B.id], deltaTime: s(2.95), trackOffset: 0 }, { points, threshold })!;
    expect(result.moves[0].start).toBe(s(7));
    expect(result.snappedTo).toBe(s(9));
  });

  it("mueve varios clips a la vez y rechaza si alguno colisiona", () => {
    const { project, A, B } = setup();
    const ok = resolveMove(project, { clipIds: [A.id, B.id], deltaTime: s(1), trackOffset: 0 })!;
    expect(ok.moves.map((m) => m.start)).toEqual([s(1), s(5)]);
    // Subir A y B a Video 2: A (1–3 s) chocaría con el Logo (1–4 s) → se rechaza.
    expect(resolveMove(project, { clipIds: [A.id, B.id], deltaTime: s(1), trackOffset: -1 })).toBeNull();
    // Sin cambiar de pista sí es válido.
    expect(resolveMove(project, { clipIds: [A.id, B.id], deltaTime: s(1.5), trackOffset: 0 })).not.toBeNull();
    // Mover A sobre B (misma pista, grupo de uno) busca el hueco libre más cercano.
    expect(resolveMove(project, { clipIds: [A.id], deltaTime: s(4.5), trackOffset: 0 })!.moves[0].start).toBe(s(6));
  });

  it("no mueve clips de pistas bloqueadas", () => {
    const { project, A } = setup();
    project.tracks[2].locked = true;
    expect(resolveMove(project, { clipIds: [A.id], deltaTime: s(1), trackOffset: 0 })).toBeNull();
  });
});

describe("resolveTrim", () => {
  const minDuration = frameToUs(1, 30);

  it("recorta el final respetando el siguiente clip y el material fuente", () => {
    const { project, A, B } = setup();
    expect(resolveTrim(project, A.id, "end", s(1), { minDuration })).toMatchObject({ start: 0, duration: s(1) });
    expect(resolveTrim(project, A.id, "end", s(10), { minDuration })!.duration).toBe(s(4)); // tope: B en 4 s
    // B empieza 1 s dentro de una fuente de 4 s: puede durar como mucho 3 s.
    expect(resolveTrim(project, B.id, "end", s(20), { minDuration, sourceDuration: s(4) })!.duration).toBe(s(3));
  });

  it("recorta el inicio desplazando sourceStart y sin pasar del inicio de la fuente", () => {
    const { project, B } = setup();
    expect(resolveTrim(project, B.id, "start", s(4.5), { minDuration })).toMatchObject({
      start: s(4.5),
      duration: s(1.5),
      sourceStart: s(1.5),
    });
    // Extender hacia la izquierda: solo hay 1 s de material antes (sourceStart = 1 s).
    expect(resolveTrim(project, B.id, "start", s(0), { minDuration })).toMatchObject({
      start: s(3),
      duration: s(3),
      sourceStart: 0,
    });
  });

  it("las imágenes no tienen límite de fuente y nunca bajan de la duración mínima", () => {
    const { project, logo } = setup();
    expect(resolveTrim(project, logo.id, "start", 0, { minDuration })).toMatchObject({ start: 0, sourceStart: 0 });
    expect(resolveTrim(project, logo.id, "end", s(100), { minDuration })!.duration).toBe(s(99));
    expect(resolveTrim(project, logo.id, "end", 0, { minDuration })!.duration).toBe(minDuration);
  });

  it("imanta el borde al playhead", () => {
    const { project, A } = setup();
    const points = collectSnapPoints(project, { excludeClipIds: new Set([A.id]), playhead: s(1.5) });
    const result = resolveTrim(project, A.id, "end", s(1.47), { minDuration, snap: { points, threshold: s(0.05) } })!;
    expect(result).toMatchObject({ duration: s(1.5), snappedTo: s(1.5) });
  });
});

describe("snapping", () => {
  it("elige el punto más cercano a cualquier borde dentro del umbral", () => {
    expect(snapEdges([100, 500], [0, 480, 1000], 30)).toEqual({ offset: -20, point: 480 });
    expect(snapEdges([100], [0, 1000], 30)).toEqual({ offset: 0, point: null });
    expect(snapThresholdUs(80)).toBe(100_000);
  });
});

describe("comandos de timeline", () => {
  it("mueve clips entre pistas y deshace", () => {
    const { project, A } = setup();
    const cmd = moveClipsCommand(project, [{ clipId: A.id, toTrackId: project.tracks[1].id, start: s(5) }])!;
    const next = cmd.execute(project);
    expect(where(next, A.id)).toMatchObject({ track: "Video 2", start: s(5) });
    expect(next.tracks[1].clips.map((c) => c.name)).toEqual(["Logo", "A"]);
    expect(cmd.undo(next)).toEqual(project);
    expect(moveClipsCommand(project, [{ clipId: A.id, toTrackId: project.tracks[2].id, start: 0 }])).toBeNull();
  });

  it("aplica y deshace recortes", () => {
    const { project, B } = setup();
    const cmd = setClipTimingCommand(project, B.id, { start: s(4.5), duration: s(1), sourceStart: s(1.5) })!;
    const next = cmd.execute(project);
    expect(where(next, B.id)).toMatchObject({ start: s(4.5), duration: s(1), sourceStart: s(1.5) });
    expect(cmd.undo(next)).toEqual(project);
  });

  it("añade pistas con nombre y posición por defecto", () => {
    const { project } = setup();
    expect(nextTrackName(project, "video")).toBe("Video 3");
    expect(nextTrackName(project, "audio")).toBe("Audio 2");
    expect(nextTrackName(project, "overlay")).toBe("Superposición");
    expect(defaultTrackIndex(project, "video")).toBe(1);
    expect(defaultTrackIndex(project, "audio")).toBe(4);

    const cmd = addTrackCommand(project, "video");
    const next = cmd.execute(project);
    expect(next.tracks.map((t) => t.name)).toEqual(["Texto", "Video 3", "Video 2", "Video 1", "Audio"]);
    expect(cmd.undo(next)).toEqual(project);
  });

  it("elimina pistas con sus clips y las restaura en su sitio", () => {
    const { project } = setup();
    const cmd = removeTrackCommand(project, project.tracks[2].id)!;
    const next = cmd.execute(project);
    expect(next.tracks.map((t) => t.name)).toEqual(["Texto", "Video 2", "Audio"]);
    expect(cmd.undo(next)).toEqual(project);
    project.tracks[0].locked = true;
    expect(removeTrackCommand(project, project.tracks[0].id)).toBeNull();
  });

  it("reordena pistas", () => {
    const { project } = setup();
    const cmd = moveTrackCommand(project, project.tracks[3].id, 0)!;
    const next = cmd.execute(project);
    expect(next.tracks.map((t) => t.name)).toEqual(["Audio", "Texto", "Video 2", "Video 1"]);
    expect(cmd.undo(next)).toEqual(project);
    expect(moveTrackCommand(project, project.tracks[0].id, 0)).toBeNull();
  });
});

describe("geometría de selección", () => {
  it("calcula la fila bajo el puntero y los clips dentro de un rectángulo", () => {
    const { project, A, B, logo } = setup();
    expect(trackIndexAtY(0, 4)).toBe(0);
    expect(trackIndexAtY(trackTop(2) + 5, 4)).toBe(2);
    expect(trackIndexAtY(9999, 4)).toBe(3);

    const vp = { pxPerSecond: 100, scrollX: 0 };
    // Rectángulo de 0,5 s a 4,5 s cubriendo Video 2 y Video 1.
    const rect = normalizeRect(450, trackTop(2) + L.trackHeight - 1, 50, trackTop(1) + 1);
    expect(clipsInRect(project, rect, vp).sort()).toEqual([logo.id, A.id, B.id].sort());
  });
});
