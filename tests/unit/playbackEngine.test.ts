import { beforeEach, describe, expect, it } from "vitest";

import { createClip, createEmptyProject } from "@/core/project/factory";
import type { Clip, MediaAsset, Project } from "@/core/project/schema";
import { getMediaClipsAt, getUpcomingMediaClips, sourceTimeAt } from "@/core/playback/schedule";
import { secondsToUs as s } from "@/core/types/time";
import {
  PlaybackEngine,
  type AudioRoute,
  type EngineHost,
  type EnginePlatform,
  type EngineSnapshot,
  type MediaElementLike,
} from "@/features/preview/engine/PlaybackEngine";

/* ------------------------------------------------------------------ */
/* Dobles de prueba                                                    */
/* ------------------------------------------------------------------ */

class FakeElement implements MediaElementLike {
  src = "";
  playbackRate = 1;
  duration = 60;
  paused = true;
  seeking = false;
  readyState = 0;
  seeks: number[] = [];
  playCalls = 0;
  destroyed = false;
  private time = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor(readonly kind: "video" | "audio") {}

  get currentTime() {
    return this.time;
  }
  set currentTime(value: number) {
    this.time = value;
    this.seeks.push(value);
    if (this.src) this.seeking = true;
  }
  play() {
    this.paused = false;
    this.playCalls++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(type: string, l: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(l);
  }
  removeEventListener(type: string, l: () => void) {
    this.listeners.get(type)?.delete(l);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((l) => l());
  }
  /** Simula que el navegador terminó de cargar o de posicionarse. */
  settle(readyState = 4) {
    this.readyState = readyState;
    if (this.seeking) {
      this.seeking = false;
      this.emit("seeked");
    } else {
      this.emit("loadeddata");
    }
  }
  /** Avanza la reproducción interna del elemento. */
  advance(seconds: number) {
    if (!this.paused) this.time += seconds * this.playbackRate;
  }
}

function createPlatform() {
  const elements: FakeElement[] = [];
  const gains = new Map<FakeElement, number>();
  const released: string[] = [];
  let frame: (() => void) | null = null;
  const clock = { ms: 0 };
  const platform: EnginePlatform = {
    now: () => clock.ms,
    requestFrame: (cb) => {
      frame = cb;
      return 1;
    },
    cancelFrame: () => {
      frame = null;
    },
    createElement: (kind) => {
      const el = new FakeElement(kind);
      elements.push(el);
      return el;
    },
    destroyElement: (el) => {
      (el as FakeElement).destroyed = true;
    },
    acquireSource: (asset) => Promise.resolve(`blob:${asset.id}`),
    releaseSource: (id) => void released.push(id),
    routeAudio: (el): AudioRoute => ({
      setGain: (v) => void gains.set(el as FakeElement, v),
      disconnect: () => undefined,
    }),
    resumeAudio: () => undefined,
  };
  return {
    platform,
    elements,
    gains,
    released,
    clock,
    /** Avanza el reloj y ejecuta el siguiente frame. */
    async runFrame(ms = 16) {
      clock.ms += ms;
      elements.forEach((el) => el.advance(ms / 1000));
      const cb = frame;
      frame = null;
      cb?.();
      await flush();
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function createHost(initial: EngineSnapshot) {
  let state = initial;
  const listeners = new Set<(n: EngineSnapshot, p: EngineSnapshot) => void>();
  const log = { frames: 0, buffering: [] as boolean[] };
  const set = (patch: Partial<EngineSnapshot>) => {
    const prev = state;
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state, prev));
  };
  const host: EngineHost = {
    getSnapshot: () => state,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setPlayhead: (t) => set({ playhead: t }),
    setPlaying: (p) => set({ isPlaying: p }),
    setBuffering: (b) => void log.buffering.push(b),
    onFrame: () => void log.frames++,
  };
  return { host, set, get: () => state, log };
}

const asset = (id: string, kind: MediaAsset["kind"] = "video"): MediaAsset => ({
  id,
  projectId: "p",
  kind,
  name: id,
  mimeType: "video/webm",
  size: 1,
  duration: s(60),
  width: 1920,
  height: 1080,
  hasAudio: true,
  blobId: `${id}-blob`,
  createdAt: 0,
});

/** Video 1: A (0–2 s, fuente desde 10 s), B (2–4 s). Audio: M (0–4 s). */
function setup() {
  const project: Project = createEmptyProject({ name: "P" });
  const ids = (() => {
    let n = 0;
    return () => `clip-${++n}`;
  })();
  const A = createClip({ type: "video", name: "A", assetId: "va", start: 0, duration: s(2), sourceStart: s(10) }, { idFactory: ids });
  const B = createClip({ type: "video", name: "B", assetId: "vb", start: s(2), duration: s(2) }, { idFactory: ids });
  const M = createClip({ type: "audio", name: "M", assetId: "au", start: 0, duration: s(4) }, { idFactory: ids });
  project.tracks[2].clips = [A, B];
  project.tracks[3].clips = [M];
  const assets = { va: asset("va"), vb: asset("vb"), au: asset("au", "audio") };
  const p = createPlatform();
  const h = createHost({ project, assets, playhead: 0, isPlaying: false });
  const engine = new PlaybackEngine(h.host, p.platform);
  return { project, A, B, M, assets, p, h, engine };
}

function elementFor(env: ReturnType<typeof setup>, index: number) {
  return env.p.elements[index];
}

/* ------------------------------------------------------------------ */

describe("schedule", () => {
  it("calcula clips activos, próximos y su posición en la fuente", () => {
    const { project, A, B, M } = setup();
    expect(getMediaClipsAt(project, s(1)).map((a) => [a.clip.name, a.sourceTime])).toEqual([
      ["A", s(11)],
      ["M", s(1)],
    ]);
    expect(getUpcomingMediaClips(project, s(1), s(2)).map((c) => c.name)).toEqual(["B"]);
    expect(sourceTimeAt(A, s(1.5))).toBe(s(11.5));
    expect(getMediaClipsAt(project, s(2)).map((a) => a.clip.id)).toEqual([B.id, M.id]);
  });
});

describe("PlaybackEngine", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it("en pausa crea los elementos activos y los posiciona en la fuente", async () => {
    env.engine.start();
    await flush();
    // A (video), M (audio) activos y B precargado (empieza en 2 s, dentro de la ventana).
    const [a, m, b] = env.p.elements;
    expect([a.kind, m.kind, b.kind]).toEqual(["video", "audio", "video"]);
    expect(a.src).toBe("blob:va");
    expect(a.currentTime).toBe(10); // sourceStart
    expect(b.currentTime).toBe(0);

    a.settle(); // termina el posicionamiento inicial
    env.h.set({ playhead: s(1.5) });
    expect(a.currentTime).toBe(11.5);
    a.settle();
    expect(env.engine.getVideoFrame(env.A.id)).toEqual({ image: a });
  });

  it("al hacer scrub rápido solo aplica el último destino tras el seek en curso", async () => {
    env.engine.start();
    await flush();
    const a = elementFor(env, 0);
    a.settle();
    env.h.set({ playhead: s(0.5) });
    env.h.set({ playhead: s(0.8) });
    env.h.set({ playhead: s(1.2) });
    expect(a.seeks.at(-1)).toBe(10.5); // los demás esperan
    a.settle(); // termina el seek → aplica el último destino pendiente
    expect(a.seeks.at(-1)).toBe(11.2);
    expect(a.seeks.filter((t) => t === 10.8)).toHaveLength(0);
  });

  it("reproduce siguiendo el reloj y corrige la deriva", async () => {
    env.engine.start();
    await flush();
    env.p.elements.forEach((el) => el.settle());
    env.h.set({ isPlaying: true });
    await env.p.runFrame(0);
    const [a, m] = env.p.elements;
    expect(a.paused).toBe(false);
    expect(m.paused).toBe(false);

    await env.p.runFrame(500);
    expect(env.h.get().playhead).toBe(s(0.5));

    // El elemento se queda atrás 0,3 s → se reposiciona.
    a.currentTime = a.currentTime - 0.3;
    a.settle();
    await env.p.runFrame(16);
    expect(a.seeks.at(-1)).toBeCloseTo(10.516, 3);
  });

  it("cambia de clip sin saltos: el siguiente ya está precargado y posicionado", async () => {
    env.engine.start();
    await flush();
    env.p.elements.forEach((el) => el.settle());
    env.h.set({ isPlaying: true });
    await env.p.runFrame(0);
    const [a, , b] = env.p.elements;
    expect(b.paused).toBe(true);
    expect(b.readyState).toBe(4);

    await env.p.runFrame(2100);
    expect(a.paused).toBe(true);
    expect(b.paused).toBe(false);
    expect(env.engine.isBuffering).toBe(false);
  });

  it("congela el reloj mientras un clip activo no tiene datos (buffering)", async () => {
    env.engine.start();
    await flush();
    const [a, m] = env.p.elements;
    m.settle();
    a.readyState = 1; // sin datos
    env.h.set({ isPlaying: true });
    await env.p.runFrame(0);
    await env.p.runFrame(300);
    expect(env.h.log.buffering).toEqual([true]);
    expect(env.h.get().playhead).toBe(0);
    expect(m.paused).toBe(true);

    a.settle();
    await env.p.runFrame(16); // vuelve a haber datos
    await env.p.runFrame(100);
    expect(env.h.log.buffering).toEqual([true, false]);
    expect(env.h.get().playhead).toBe(s(0.1));
    expect(a.paused).toBe(false);
  });

  it("se detiene al final del proyecto", async () => {
    env.engine.start();
    await flush();
    env.p.elements.forEach((el) => el.settle());
    env.h.set({ isPlaying: true });
    await env.p.runFrame(0);
    await env.p.runFrame(2000);
    env.p.elements.forEach((el) => el.readyState === 4 || el.settle());
    await env.p.runFrame(2500);
    expect(env.h.get()).toMatchObject({ isPlaying: false, playhead: s(4) });
    expect(env.p.elements.every((el) => el.paused)).toBe(true);
  });

  it("silencia por ganancia las pistas silenciadas", async () => {
    env.project.tracks[3].muted = true;
    env.engine.start();
    await flush();
    const [a, m] = env.p.elements;
    expect(env.p.gains.get(a)).toBe(1);
    expect(env.p.gains.get(m)).toBe(0);
  });

  it("aplica la velocidad y el volumen de cada clip", async () => {
    env.project.tracks[2].clips[0] = { ...env.A, speed: 2, volume: 0.5 };
    env.engine.start();
    await flush();
    env.p.elements.forEach((el) => el.settle());
    const a = env.p.elements[0];
    expect(env.p.gains.get(a)).toBe(0.5);
    env.h.set({ isPlaying: true });
    await env.p.runFrame(0);
    expect(a.playbackRate).toBe(2);
    await env.p.runFrame(500);
    // 0,5 s de timeline a 2× = 1 s de fuente: 10 s + 1 s; sin reposicionar.
    expect(a.seeks.at(-1)).toBe(10);
    env.h.set({ isPlaying: false });
    expect(a.currentTime).toBeCloseTo(11, 2);
  });

  it("mantiene el último fotograma del clip saliente durante una transición", async () => {
    const B = { ...env.B, transitionIn: { type: "crossfade" as const, duration: s(1) } };
    env.project.tracks[2].clips[1] = B;
    env.h.set({ playhead: s(2.3) }); // 0,3 s después del corte, dentro de la ventana
    env.engine.start();
    await flush();
    const a = env.p.elements.find((el) => el.src === "blob:va")!;
    // Fuente de A: 10 s + 2 s de clip − 1 frame.
    expect(a.currentTime).toBeCloseTo(12 - 1 / 30, 3);
    a.settle();
    expect(env.engine.getVideoFrame(env.A.id)).toEqual({ image: a });
  });

  it("pinta solo cuando cambia el frame del proyecto", async () => {
    env.engine.start();
    await flush();
    env.p.elements.forEach((el) => el.settle());
    env.h.set({ isPlaying: true });
    await env.p.runFrame(0);
    const before = env.h.log.frames;
    await env.p.runFrame(10); // frame 0 (30 fps → 33 ms)
    await env.p.runFrame(10);
    expect(env.h.log.frames).toBe(before);
    await env.p.runFrame(20); // 40 ms → frame 1
    expect(env.h.log.frames).toBe(before + 1);
  });

  it("libera elementos de clips eliminados y su fuente", async () => {
    env.engine.start();
    await flush();
    const a = elementFor(env, 0);
    const project = { ...env.project, tracks: env.project.tracks.map((t, i) => (i === 2 ? { ...t, clips: [env.B] } : t)) };
    env.h.set({ project });
    expect(a.destroyed).toBe(true);
    expect(env.p.released).toContain("va");
    env.engine.dispose();
    expect(env.p.elements.every((el) => el.destroyed)).toBe(true);
  });

  it("marca como fallido un video que el navegador no puede reproducir", async () => {
    env.engine.start();
    await flush();
    elementFor(env, 0).emit("error");
    expect(env.engine.getVideoFrame((env.A as Clip).id)).toEqual({ failed: true });
  });
});
