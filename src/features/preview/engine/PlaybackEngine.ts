import { getHeldFrames } from "@/core/playback/composition";
import {
  getMediaClipsAt,
  getUpcomingMediaClips,
  isFarFrom,
  needsResync,
  type ActiveMedia,
} from "@/core/playback/schedule";
import { findClip, getProjectDuration } from "@/core/project/queries";
import type { Clip, MediaAsset, Project } from "@/core/project/schema";
import { frameToUs, secondsToUs, usToFrame, usToSeconds, type Microseconds } from "@/core/types/time";

/**
 * Motor de reproducción de la preview.
 *
 * - Reloj maestro propio (`now()`); los elementos multimedia siguen al reloj y
 *   se reposicionan si se desvían más de una tolerancia.
 * - Un elemento `<video>`/`<audio>` por clip con medio, creado al acercarse el
 *   clip (precarga + posicionado previo para cambiar de clip sin saltos) y
 *   liberado al alejarse.
 * - Si un clip activo no tiene datos suficientes, el reloj se congela
 *   (buffering) hasta que los tenga.
 * - En pausa, cada cambio de playhead posiciona los elementos (seek) sin
 *   encadenar peticiones: si ya hay un seek en curso se guarda el último destino.
 *
 * No depende de React ni del DOM: la plataforma se inyecta (y se simula en pruebas).
 */

/** `HTMLMediaElement.readyState` */
export const HAVE_CURRENT_DATA = 2;
export const HAVE_FUTURE_DATA = 3;

export interface MediaElementLike {
  currentTime: number;
  playbackRate: number;
  src: string;
  readonly duration: number;
  readonly paused: boolean;
  readonly seeking: boolean;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface AudioRoute {
  setGain(value: number): void;
  disconnect(): void;
}

export interface EnginePlatform {
  /** Milisegundos monotónicos. */
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  createElement(kind: "video" | "audio"): MediaElementLike;
  destroyElement(element: MediaElementLike): void;
  /** URL reproducible del archivo del asset (con recuento de referencias). */
  acquireSource(asset: MediaAsset): Promise<string>;
  releaseSource(assetId: string): void;
  routeAudio(element: MediaElementLike): AudioRoute | null;
  /** Se llama al pulsar reproducir (gesto del usuario): reanuda el AudioContext. */
  resumeAudio(): void;
}

export interface EngineSnapshot {
  project: Project | null;
  assets: Readonly<Record<string, MediaAsset>>;
  playhead: Microseconds;
  isPlaying: boolean;
}

export interface EngineHost {
  getSnapshot(): EngineSnapshot;
  subscribe(listener: (next: EngineSnapshot, prev: EngineSnapshot) => void): () => void;
  setPlayhead(time: Microseconds): void;
  setPlaying(playing: boolean): void;
  setBuffering(buffering: boolean): void;
  /** Hay un frame nuevo que pintar. */
  onFrame(): void;
}

export type VideoFrameResult = { image: MediaElementLike } | { failed: true } | null;

interface Entry {
  clipId: string;
  assetId: string;
  kind: "video" | "audio";
  element: MediaElementLike;
  route: AudioRoute | null;
  sourceReady: boolean;
  failed: boolean;
  /** Destino guardado mientras hay un seek en curso o la fuente aún no está lista (segundos). */
  pendingSeek: number | null;
  lastUsed: number;
  listeners: Array<[string, () => void]>;
}

export const PRELOAD_WINDOW: Microseconds = secondsToUs(2);
/** Desviación tolerada durante la reproducción antes de reposicionar un elemento. */
export const PLAYING_TOLERANCE: Microseconds = secondsToUs(0.15);
export const MAX_ELEMENTS = 8;
/** Cerca del final del archivo no hay "datos futuros": no se considera bloqueo. */
const END_OF_SOURCE_MARGIN_S = 0.5;

export class PlaybackEngine {
  private readonly entries = new Map<string, Entry>();
  private playing = false;
  private buffering = false;
  private anchorTime: Microseconds = 0;
  private anchorNow = 0;
  private frameId: number | null = null;
  private lastFrameIndex = -1;
  private internal = false;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(
    private readonly host: EngineHost,
    private readonly platform: EnginePlatform,
  ) {}

  start(): void {
    this.unsubscribe = this.host.subscribe((next, prev) => this.onChange(next, prev));
    const snapshot = this.host.getSnapshot();
    if (snapshot.isPlaying) this.play(snapshot);
    else this.syncPaused(snapshot);
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    if (this.frameId !== null) this.platform.cancelFrame(this.frameId);
    for (const entry of [...this.entries.values()]) this.destroyEntry(entry);
  }

  /** Elemento de video listo para dibujar del clip, si lo hay. */
  getVideoFrame(clipId: string): VideoFrameResult {
    const entry = this.entries.get(clipId);
    if (!entry || entry.kind !== "video") return null;
    if (entry.failed) return { failed: true };
    return entry.sourceReady && entry.element.readyState >= HAVE_CURRENT_DATA ? { image: entry.element } : null;
  }

  /** Número de elementos multimedia vivos (diagnóstico y pruebas). */
  get elementCount(): number {
    return this.entries.size;
  }

  get isBuffering(): boolean {
    return this.buffering;
  }

  /* ---------------------------------------------------------------- */
  /* Cambios de estado                                                  */
  /* ---------------------------------------------------------------- */

  private onChange(next: EngineSnapshot, prev: EngineSnapshot): void {
    if (this.internal || this.disposed) return;
    if (next.isPlaying !== this.playing) {
      if (next.isPlaying) this.play(next);
      else this.stop(next);
      return;
    }
    if (this.playing) {
      // Salto externo durante la reproducción (p. ej. "ir al inicio").
      if (next.playhead !== prev.playhead) this.anchor(next.playhead);
      return;
    }
    if (next.playhead !== prev.playhead || next.project !== prev.project || next.assets !== prev.assets) {
      this.syncPaused(next);
    }
  }

  private withInternal(fn: () => void): void {
    this.internal = true;
    try {
      fn();
    } finally {
      this.internal = false;
    }
  }

  private anchor(time: Microseconds): void {
    this.anchorTime = time;
    this.anchorNow = this.platform.now();
  }

  private setBuffering(value: boolean): void {
    if (this.buffering === value) return;
    this.buffering = value;
    this.withInternal(() => this.host.setBuffering(value));
  }

  private play(snapshot: EngineSnapshot): void {
    this.platform.resumeAudio();
    this.playing = true;
    this.anchor(snapshot.playhead);
    this.lastFrameIndex = -1;
    this.scheduleTick();
  }

  private stop(snapshot: EngineSnapshot): void {
    this.playing = false;
    if (this.frameId !== null) this.platform.cancelFrame(this.frameId);
    this.frameId = null;
    this.setBuffering(false);
    this.pauseAll();
    this.syncPaused(snapshot);
  }

  private scheduleTick(): void {
    if (this.frameId === null && !this.disposed) this.frameId = this.platform.requestFrame(this.tick);
  }

  /* ---------------------------------------------------------------- */
  /* Bucle de reproducción                                              */
  /* ---------------------------------------------------------------- */

  private readonly tick = (): void => {
    this.frameId = null;
    if (!this.playing || this.disposed) return;
    const snapshot = this.host.getSnapshot();
    const { project } = snapshot;
    if (!project) return;

    const now = this.platform.now();
    const time = this.buffering ? this.anchorTime : this.anchorTime + Math.round((now - this.anchorNow) * 1000);
    const duration = getProjectDuration(project);

    if (time >= duration) {
      this.playing = false;
      this.setBuffering(false);
      this.pauseAll();
      this.withInternal(() => {
        this.host.setPlayhead(duration);
        this.host.setPlaying(false);
      });
      this.syncPaused(this.host.getSnapshot());
      return;
    }

    const active = getMediaClipsAt(project, time);
    const stalled = this.syncPlaying(snapshot, active, now);
    this.preload(project, snapshot.assets, time);
    this.holdFrames(project, snapshot.assets, time);
    this.pauseInactive(active);

    if (stalled && !this.buffering) {
      this.setBuffering(true);
      this.anchor(time);
      this.pauseAll();
    } else if (!stalled && this.buffering) {
      // Datos disponibles: se reanuda desde el instante congelado.
      this.setBuffering(false);
      this.anchor(time);
    }

    // Control de FPS: el tiempo se publica (y se pide redibujar) solo cuando
    // cambia el frame del proyecto. En pantallas de 120 Hz con un proyecto a
    // 30 fps, eso evita 3 de cada 4 actualizaciones del estado y de la UI.
    const frameIndex = usToFrame(time, project.settings.fps);
    if (frameIndex !== this.lastFrameIndex && !this.buffering) {
      this.lastFrameIndex = frameIndex;
      this.withInternal(() => this.host.setPlayhead(time));
      this.host.onFrame();
    }

    this.evict(project, time);
    this.scheduleTick();
  };

  /** Sincroniza los clips activos; devuelve `true` si alguno no tiene datos suficientes. */
  private syncPlaying(snapshot: EngineSnapshot, active: ActiveMedia[], now: number): boolean {
    let stalled = false;
    for (const { clip, track, sourceTime } of active) {
      const asset = clip.assetId ? snapshot.assets[clip.assetId] : undefined;
      if (!asset) continue;
      const entry = this.ensureEntry(clip, asset);
      if (entry.failed) continue;
      entry.lastUsed = now;
      entry.route?.setGain(track.muted ? 0 : clip.volume);

      const { element } = entry;
      if (element.playbackRate !== clip.speed) element.playbackRate = clip.speed;
      const expected = usToSeconds(sourceTime);
      const nearEnd = Number.isFinite(element.duration) && element.duration - expected < END_OF_SOURCE_MARGIN_S;
      const ready =
        entry.sourceReady &&
        !element.seeking &&
        element.readyState >= (nearEnd ? HAVE_CURRENT_DATA : HAVE_FUTURE_DATA);

      if (!ready) {
        stalled = true;
        if (entry.sourceReady && !element.seeking && needsResync(secondsToUs(element.currentTime), sourceTime, PLAYING_TOLERANCE)) {
          element.currentTime = expected;
        }
        continue;
      }
      if (this.buffering) continue; // Se reanudará en el siguiente tick.
      if (needsResync(secondsToUs(element.currentTime), sourceTime, PLAYING_TOLERANCE)) {
        element.currentTime = expected;
      }
      if (element.paused) element.play().catch(() => undefined);
    }
    return stalled;
  }

  /* ---------------------------------------------------------------- */
  /* Pausa y seeking                                                    */
  /* ---------------------------------------------------------------- */

  private syncPaused(snapshot: EngineSnapshot): void {
    const { project } = snapshot;
    if (!project || this.disposed) return;
    const active = getMediaClipsAt(project, snapshot.playhead);
    for (const { clip, track, sourceTime } of active) {
      const asset = clip.assetId ? snapshot.assets[clip.assetId] : undefined;
      if (!asset) continue;
      const entry = this.ensureEntry(clip, asset);
      entry.lastUsed = this.platform.now();
      entry.route?.setGain(track.muted ? 0 : clip.volume);
      if (!entry.element.paused) entry.element.pause();
      this.seek(entry, sourceTime, project.settings.fps);
    }
    this.pauseInactive(active);
    this.preload(project, snapshot.assets, snapshot.playhead);
    this.holdFrames(project, snapshot.assets, snapshot.playhead);
    this.evict(project, snapshot.playhead);
    this.host.onFrame();
  }

  private seek(entry: Entry, sourceTime: Microseconds, fps: number): void {
    const target = usToSeconds(sourceTime);
    if (!entry.sourceReady || entry.element.seeking) {
      entry.pendingSeek = target;
      return;
    }
    const halfFrame = Math.round(frameToUs(1, fps) / 2);
    if (needsResync(secondsToUs(entry.element.currentTime), sourceTime, halfFrame)) {
      entry.element.currentTime = target;
    }
  }

  /** Crea y posiciona en su primer frame los clips que van a empezar pronto. */
  private preload(project: Project, assets: Readonly<Record<string, MediaAsset>>, time: Microseconds): void {
    for (const clip of getUpcomingMediaClips(project, time, PRELOAD_WINDOW)) {
      const asset = clip.assetId ? assets[clip.assetId] : undefined;
      if (!asset) continue;
      const entry = this.ensureEntry(clip, asset);
      entry.lastUsed = this.platform.now();
      if (!entry.element.paused) entry.element.pause();
      this.seek(entry, clip.sourceStart, project.settings.fps);
    }
  }

  /** Clips en la ventana de una transición fuera de su rango: fotograma congelado. */
  private holdFrames(project: Project, assets: Readonly<Record<string, MediaAsset>>, time: Microseconds): void {
    const { fps } = project.settings;
    for (const { clip, sourceTime } of getHeldFrames(project, time, frameToUs(1, fps))) {
      const asset = clip.assetId ? assets[clip.assetId] : undefined;
      if (!asset) continue;
      const entry = this.ensureEntry(clip, asset);
      entry.lastUsed = this.platform.now();
      if (!entry.element.paused) entry.element.pause();
      this.seek(entry, sourceTime, fps);
    }
  }

  private pauseInactive(active: ActiveMedia[]): void {
    const ids = new Set(active.map((a) => a.clip.id));
    for (const entry of this.entries.values()) {
      if (!ids.has(entry.clipId) && !entry.element.paused) entry.element.pause();
    }
  }

  private pauseAll(): void {
    for (const entry of this.entries.values()) {
      if (!entry.element.paused) entry.element.pause();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Elementos                                                          */
  /* ---------------------------------------------------------------- */

  private ensureEntry(clip: Clip, asset: MediaAsset): Entry {
    const existing = this.entries.get(clip.id);
    if (existing && existing.assetId === asset.id) return existing;
    if (existing) this.destroyEntry(existing);

    const kind = clip.type === "video" ? "video" : "audio";
    const element = this.platform.createElement(kind);
    const entry: Entry = {
      clipId: clip.id,
      assetId: asset.id,
      kind,
      element,
      route: this.platform.routeAudio(element),
      sourceReady: false,
      failed: false,
      pendingSeek: null,
      lastUsed: this.platform.now(),
      listeners: [],
    };

    const on = (type: string, listener: () => void) => {
      element.addEventListener(type, listener);
      entry.listeners.push([type, listener]);
    };
    const applyPending = () => {
      if (entry.pendingSeek === null) return false;
      const target = entry.pendingSeek;
      entry.pendingSeek = null;
      element.currentTime = target;
      return true;
    };
    on("seeked", () => {
      if (!applyPending()) this.host.onFrame();
    });
    on("loadeddata", () => this.host.onFrame());
    on("error", () => {
      entry.failed = true;
      this.host.onFrame();
    });

    this.entries.set(clip.id, entry);

    this.platform
      .acquireSource(asset)
      .then((url) => {
        if (this.entries.get(clip.id) !== entry) {
          this.platform.releaseSource(asset.id);
          return;
        }
        element.src = url;
        entry.sourceReady = true;
        applyPending();
      })
      .catch(() => {
        entry.failed = true;
        this.host.onFrame();
      });

    return entry;
  }

  private destroyEntry(entry: Entry): void {
    for (const [type, listener] of entry.listeners) entry.element.removeEventListener(type, listener);
    entry.element.pause();
    entry.route?.disconnect();
    this.platform.destroyElement(entry.element);
    if (entry.sourceReady) this.platform.releaseSource(entry.assetId);
    this.entries.delete(entry.clipId);
  }

  /** Libera elementos de clips eliminados y, por encima del límite, los lejanos menos usados. */
  private evict(project: Project, time: Microseconds): void {
    for (const entry of [...this.entries.values()]) {
      const clip = findClip(project, entry.clipId)?.clip;
      if (!clip || clip.assetId !== entry.assetId) this.destroyEntry(entry);
    }
    if (this.entries.size <= MAX_ELEMENTS) return;
    const candidates = [...this.entries.values()]
      .filter((entry) => {
        const clip = findClip(project, entry.clipId)?.clip;
        return !clip || isFarFrom(clip, time, PRELOAD_WINDOW);
      })
      .sort((a, b) => a.lastUsed - b.lastUsed);
    while (this.entries.size > MAX_ELEMENTS && candidates.length > 0) {
      this.destroyEntry(candidates.shift()!);
    }
  }
}
