import type { MediaAsset } from "@/core/project/schema";
import { getRepositories } from "@/infrastructure";

import type { AudioRoute, EnginePlatform, MediaElementLike } from "./PlaybackEngine";

interface SourceRecord {
  refs: number;
  url: Promise<string>;
}

/**
 * Implementación de la plataforma del motor sobre las APIs del navegador.
 *
 * - Los elementos viven en un contenedor oculto del DOM (algunos navegadores
 *   limitan la reproducción de elementos desconectados).
 * - Los archivos se leen de IndexedDB y se exponen como object URLs con
 *   recuento de referencias; se revocan cuando nadie los usa.
 * - El audio pasa por Web Audio (un GainNode por elemento) para poder
 *   silenciar pistas y, más adelante, controlar el volumen.
 */
export function createBrowserPlatform(): EnginePlatform & { dispose(): void } {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.dataset.webcutMedia = "";
  Object.assign(container.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
    left: "0",
    top: "0",
  });
  document.body.appendChild(container);

  const sources = new Map<string, SourceRecord>();
  let audioContext: AudioContext | null = null;

  const getAudioContext = (): AudioContext | null => {
    if (audioContext) return audioContext;
    if (typeof AudioContext === "undefined") return null;
    audioContext = new AudioContext({ latencyHint: "playback" });
    return audioContext;
  };

  return {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(() => callback()),
    cancelFrame: (id) => cancelAnimationFrame(id),

    createElement(kind) {
      const element = document.createElement(kind);
      element.preload = "auto";
      if (element instanceof HTMLVideoElement) {
        element.playsInline = true;
        element.disablePictureInPicture = true;
      }
      container.appendChild(element);
      return element as MediaElementLike;
    },

    destroyElement(element) {
      const media = element as unknown as HTMLMediaElement;
      media.pause();
      media.removeAttribute("src");
      media.load(); // libera el decodificador
      media.remove();
    },

    acquireSource(asset: MediaAsset) {
      const existing = sources.get(asset.id);
      if (existing) {
        existing.refs++;
        return existing.url;
      }
      const url = getRepositories()
        .blobs.get(asset.blobId)
        .then((blob) => {
          if (!blob) throw new Error(`Archivo no encontrado para ${asset.id}`);
          return URL.createObjectURL(blob);
        });
      sources.set(asset.id, { refs: 1, url });
      url.catch(() => sources.delete(asset.id));
      return url;
    },

    releaseSource(assetId) {
      const record = sources.get(assetId);
      if (!record) return;
      record.refs--;
      if (record.refs > 0) return;
      sources.delete(assetId);
      record.url.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
    },

    routeAudio(element): AudioRoute | null {
      const ctx = getAudioContext();
      if (!ctx) return null;
      try {
        const source = ctx.createMediaElementSource(element as unknown as HTMLMediaElement);
        const gain = ctx.createGain();
        source.connect(gain).connect(ctx.destination);
        return {
          setGain: (value) => {
            if (gain.gain.value !== value) gain.gain.setValueAtTime(value, ctx.currentTime);
          },
          disconnect: () => {
            source.disconnect();
            gain.disconnect();
          },
        };
      } catch {
        return null;
      }
    },

    resumeAudio() {
      const ctx = getAudioContext();
      if (ctx?.state === "suspended") void ctx.resume().catch(() => undefined);
    },

    dispose() {
      for (const record of sources.values()) {
        record.url.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
      }
      sources.clear();
      container.remove();
      void audioContext?.close().catch(() => undefined);
      audioContext = null;
    },
  };
}
