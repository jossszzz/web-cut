import { describe, expect, it } from "vitest";

import {
  evaluateTransform,
  interpolate,
  keyframeTimes,
  removeKeyframe,
  shiftKeyframes,
  splitKeyframes,
  upsertKeyframe,
} from "@/core/animation/keyframes";
import {
  setClipSpeedCommand,
  setTransformCommand,
  setTransitionCommand,
  splitClipsCommand,
  toggleKeyframeCommand,
  trimAtTime,
} from "@/core/commands/editCommands";
import { setClipTimingCommand } from "@/core/commands/timelineCommands";
import { getCut, getHeldFrames, getVisualLayersAt } from "@/core/playback/composition";
import { sourceTimeAt } from "@/core/playback/schedule";
import { createClip, createEmptyProject } from "@/core/project/factory";
import { findClip } from "@/core/project/queries";
import { projectSchema, type Clip, type Keyframe, type Project } from "@/core/project/schema";
import { resolveTrim } from "@/core/timeline/edit";
import { secondsToUs as s } from "@/core/types/time";

import { sequentialIds } from "./helpers";

const kf = (time: number, value: number, easing: Keyframe["easing"] = "linear"): Keyframe => ({ time, value, easing });
const ctx = (time: number) => ({ time, tolerance: s(1 / 60) });

/** Video 1: A (0–4 s, video, fuente desde 1 s), B (4–8 s, imagen). */
function setup() {
  const ids = sequentialIds("c");
  const project = createEmptyProject({ name: "P", idFactory: sequentialIds("t") });
  const A = createClip({ type: "video", name: "A", assetId: "v", start: 0, duration: s(4), sourceStart: s(1) }, { idFactory: ids });
  const B = createClip({ type: "image", name: "B", assetId: "i", start: s(4), duration: s(4) }, { idFactory: ids });
  project.tracks[2].clips = [A, B];
  return { project, A, B, ids };
}

const get = (p: Project, id: string): Clip => findClip(p, id)!.clip;

describe("keyframes", () => {
  it("interpola linealmente y con suavizado, manteniendo los extremos", () => {
    const list = [kf(0, 0), kf(100, 10)];
    expect(interpolate(list, -5)).toBe(0);
    expect(interpolate(list, 50)).toBe(5);
    expect(interpolate(list, 500)).toBe(10);
    expect(interpolate([kf(0, 0, "ease-in-out"), kf(100, 10)], 25)).toBeCloseTo(1.25);
  });

  it("evalúa la transformación mezclando valores estáticos y animados", () => {
    const { A } = setup();
    const clip = { ...A, transform: { ...A.transform, y: 50 }, keyframes: { x: [kf(0, 0), kf(s(2), 200)] } };
    expect(evaluateTransform(clip, s(1))).toMatchObject({ x: 100, y: 50, opacity: 1 });
  });

  it("inserta, actualiza, elimina y desplaza keyframes", () => {
    let keys = upsertKeyframe({}, "opacity", 100, 1, 5);
    keys = upsertKeyframe(keys, "opacity", 0, 0, 5);
    keys = upsertKeyframe(keys, "opacity", 103, 0.5, 5); // dentro de la tolerancia: actualiza
    expect(keys.opacity).toEqual([kf(0, 0), kf(100, 0.5)]);
    expect(shiftKeyframes(keys, -10).opacity!.map((k) => k.time)).toEqual([-10, 90]);
    keys = removeKeyframe(keys, "opacity", 0, 5);
    keys = removeKeyframe(keys, "opacity", 100, 5);
    expect(keys.opacity).toBeUndefined();
  });

  it("al dividir, ambas mitades conservan la animación en el corte", () => {
    const { left, right } = splitKeyframes({ x: [kf(0, 0), kf(100, 100)] }, 40);
    expect(left.x).toEqual([kf(0, 0), kf(40, 40)]);
    expect(right.x).toEqual([kf(0, 40), kf(60, 100)]);
  });
});

describe("dividir", () => {
  it("divide el clip en el playhead conservando la fuente y la animación", () => {
    const { project, A } = setup();
    const withKeys = { ...project, tracks: project.tracks.map((t, i) => (i === 2 ? { ...t, clips: [{ ...A, keyframes: { x: [kf(0, 0), kf(s(4), 400)] } }, t.clips[1]] } : t)) };
    const result = splitClipsCommand(withKeys, s(1), [A.id], () => "nuevo")!;
    const next = result.command.execute(withKeys);
    const left = get(next, A.id);
    const right = get(next, "nuevo");
    expect([left.start, left.duration, left.sourceStart]).toEqual([0, s(1), s(1)]);
    expect([right.start, right.duration, right.sourceStart]).toEqual([s(1), s(3), s(2)]);
    expect(evaluateTransform(right, 0).x).toBe(100);
    expect(result.rightIds).toEqual(["nuevo"]);
    expect(result.command.undo(next)).toEqual(withKeys);
    expect(projectSchema.safeParse(next).success).toBe(true);
  });

  it("sin selección divide todo lo que hay bajo el playhead; respeta bloqueos y bordes", () => {
    const { project } = setup();
    const audio = createClip({ type: "audio", name: "M", assetId: "a", start: 0, duration: s(8) }, { idFactory: () => "m" });
    project.tracks[3].clips = [audio];
    const all = splitClipsCommand(project, s(2), undefined, sequentialIds("n"))!;
    expect(all.rightIds).toHaveLength(2);
    expect(splitClipsCommand(project, s(4), [project.tracks[2].clips[0].id])).toBeNull(); // justo en el borde
    project.tracks[3].locked = true;
    expect(splitClipsCommand(project, s(2), undefined)!.rightIds).toHaveLength(1);
  });

  it("con velocidad, la mitad derecha empieza en la fuente según la velocidad", () => {
    const { project, A } = setup();
    project.tracks[2].clips[0] = { ...A, speed: 2, duration: s(2) };
    const r = splitClipsCommand(project, s(1), [A.id], () => "r")!;
    expect(get(r.command.execute(project), "r").sourceStart).toBe(s(3));
  });
});

describe("transformación con keyframes", () => {
  it("sin keyframes cambia el valor estático; con keyframes crea uno en el playhead", () => {
    const { project, A } = setup();
    let p = setTransformCommand(project, A.id, { x: 10 }, ctx(s(1)))!.execute(project);
    expect(get(p, A.id).transform.x).toBe(10);

    p = toggleKeyframeCommand(p, A.id, ["x"], ctx(s(1)))!.execute(p); // keyframe x=10 en 1 s
    p = setTransformCommand(p, A.id, { x: 90 }, ctx(s(3)))!.execute(p); // nuevo keyframe en 3 s
    const clip = get(p, A.id);
    expect(clip.keyframes.x).toEqual([kf(s(1), 10), kf(s(3), 90)]);
    expect(evaluateTransform(clip, s(2)).x).toBe(50);
    expect(keyframeTimes(clip)).toEqual([s(1), s(3)]);

    // Quitar el keyframe en 3 s y luego el de 1 s: el valor actual pasa a estático.
    p = toggleKeyframeCommand(p, A.id, ["x"], ctx(s(3)))!.execute(p);
    p = toggleKeyframeCommand(p, A.id, ["x"], ctx(s(1)))!.execute(p);
    expect(get(p, A.id).keyframes).toEqual({});
    expect(get(p, A.id).transform.x).toBe(10);
  });

  it("no permite keyframes fuera del clip", () => {
    const { project, A } = setup();
    expect(toggleKeyframeCommand(project, A.id, ["x"], ctx(s(6)))).toBeNull();
  });

  it("al recortar el inicio los keyframes siguen anclados al contenido", () => {
    const { project, A } = setup();
    project.tracks[2].clips[0] = { ...A, keyframes: { x: [kf(s(2), 5)] } };
    const p = setClipTimingCommand(project, A.id, { start: s(1), duration: s(3), sourceStart: s(2) })!.execute(project);
    expect(get(p, A.id).keyframes.x![0].time).toBe(s(1));
  });
});

describe("velocidad", () => {
  it("cambia la duración en proporción y escala los keyframes", () => {
    const { project, A } = setup();
    project.tracks[2].clips = [{ ...A, keyframes: { x: [kf(s(2), 1)] } }]; // sin vecino
    const p = setClipSpeedCommand(project, A.id, 2)!.execute(project);
    expect(get(p, A.id)).toMatchObject({ speed: 2, duration: s(2) });
    expect(get(p, A.id).keyframes.x![0].time).toBe(s(1));
    expect(sourceTimeAt(get(p, A.id), s(1))).toBe(s(3));
  });

  it("al ralentizar no invade el clip siguiente", () => {
    const { project, A } = setup();
    const p = setClipSpeedCommand(project, A.id, 0.5)!.execute(project);
    expect(get(p, A.id).duration).toBe(s(4)); // B empieza en 4 s
    expect(setClipSpeedCommand(project, project.tracks[2].clips[1].id, 2)).toBeNull(); // imagen
  });

  it("los recortes respetan la velocidad", () => {
    const { project, A } = setup();
    project.tracks[2].clips = [{ ...A, speed: 2, duration: s(2) }];
    // Fuente de 10 s, empezando en 1 s, a 2×: caben 4,5 s de timeline.
    const end = resolveTrim(project, A.id, "end", s(20), { minDuration: 1, sourceDuration: s(10) })!;
    expect(end.duration).toBe(s(4.5));
  });
});

describe("transiciones", () => {
  it("solo se aplican entre clips visuales adyacentes y la duración se limita", () => {
    const { project, A, B } = setup();
    expect(setTransitionCommand(project, A.id, { type: "fade", duration: s(1) })).toBeNull(); // nada antes
    const p = setTransitionCommand(project, B.id, { type: "crossfade", duration: s(30) })!.execute(project);
    expect(get(p, B.id).transitionIn).toEqual({ type: "crossfade", duration: s(2) });
    expect(getCut(p.tracks[2], get(p, B.id))).toMatchObject({ start: s(3), end: s(5) });
  });

  it("compone ambos clips durante la ventana con el progreso correcto", () => {
    const { project, A, B } = setup();
    const p = setTransitionCommand(project, B.id, { type: "crossfade", duration: s(2) })!.execute(project);
    const mid = getVisualLayersAt(p, s(4)).map((l) => [l.clip.name, l.transition?.role, l.transition?.progress, l.localTime]);
    expect(mid).toEqual([
      ["A", "out", 0.5, s(4)],
      ["B", "in", 0.5, 0],
    ]);
    expect(getVisualLayersAt(p, s(2)).map((l) => l.clip.name)).toEqual(["A"]);
    expect(getVisualLayersAt(p, s(6)).map((l) => l.clip.name)).toEqual(["B"]);
    // Tras el corte, A muestra su último fotograma (congelado).
    expect(getHeldFrames(p, s(4.5), s(1 / 30))).toEqual([{ clip: get(p, A.id), sourceTime: s(5) - s(1 / 30) }]);
    // Si se separan los clips, la transición deja de aplicarse.
    const moved = { ...p, tracks: p.tracks.map((t, i) => (i === 2 ? { ...t, clips: [t.clips[0], { ...t.clips[1], start: s(5) }] } : t)) };
    expect(getVisualLayersAt(moved, s(5.2)).map((l) => l.transition)).toEqual([undefined]);
  });
});

describe("recortar hasta el playhead", () => {
  it("elimina la parte izquierda o derecha", () => {
    const { A } = setup();
    expect(trimAtTime(A, s(1), "left")).toEqual({ start: s(1), duration: s(3), sourceStart: s(2) });
    expect(trimAtTime(A, s(1), "right")).toEqual({ start: 0, duration: s(1), sourceStart: s(1) });
    expect(trimAtTime(A, s(5), "left")).toBeNull();
  });
});

describe("migración", () => {
  it("los proyectos guardados antes de la Fase 5 se completan con valores por defecto", () => {
    const { project } = setup();
    const legacy = JSON.parse(JSON.stringify(project));
    for (const t of legacy.tracks) for (const c of t.clips) for (const k of ["speed", "volume", "crop", "keyframes"]) delete c[k];
    const parsed = projectSchema.parse(legacy);
    expect(parsed.tracks[2].clips[0]).toMatchObject({ speed: 1, volume: 1, crop: { left: 0 }, keyframes: {} });
  });
});

describe("composeCommands", () => {
  it("agrupa comandos en un solo paso y deshace en orden inverso", async () => {
    const { composeCommands } = await import("@/core/commands/compose");
    const { project, A, B } = setup();
    const cmd = composeCommands("Recortar", [
      setClipTimingCommand(project, A.id, { start: 0, duration: s(1), sourceStart: s(1) }),
      null,
      setClipTimingCommand(project, B.id, { start: s(5), duration: s(3), sourceStart: 0 }),
    ])!;
    const next = cmd.execute(project);
    expect([get(next, A.id).duration, get(next, B.id).start]).toEqual([s(1), s(5)]);
    expect(cmd.undo(next)).toEqual(project);
    expect(composeCommands("x", [null])).toBeNull();
  });
});
