import { describe, expect, it } from "vitest";

import { LruBudget } from "@/lib/cache/lruBudget";

describe("LruBudget", () => {
  it("expulsa primero lo menos usado recientemente al superar el presupuesto", () => {
    const lru = new LruBudget<string>(100);
    expect(lru.add("a", 40)).toEqual([]);
    expect(lru.add("b", 40)).toEqual([]);
    lru.touch("a"); // "b" pasa a ser el menos reciente
    expect(lru.add("c", 40)).toEqual(["b"]);
    expect(lru.used).toBe(80);
    expect(lru.has("a") && lru.has("c") && !lru.has("b")).toBe(true);
  });

  it("nunca expulsa lo recién añadido aunque supere el presupuesto por sí solo", () => {
    const lru = new LruBudget<string>(100);
    lru.add("a", 30);
    expect(lru.add("enorme", 500)).toEqual(["a"]);
    expect(lru.has("enorme")).toBe(true);
    expect(lru.used).toBe(500);
  });

  it("actualizar una clave no la cuenta dos veces y quitarla libera su coste", () => {
    const lru = new LruBudget<number>(10);
    lru.add(1, 4);
    lru.add(1, 6);
    expect(lru.used).toBe(6);
    lru.remove(1);
    lru.remove(1);
    expect(lru.used).toBe(0);
    lru.add(2, 3);
    lru.clear();
    expect(lru.used).toBe(0);
    expect(lru.has(2)).toBe(false);
  });
});

describe("compatibilidad del navegador", async () => {
  const { canExport, detectBrowserSupport, missingEssentials } = await import("@/lib/browserSupport");
  const fakeScope = (names: string[], canvas = true) =>
    ({
      ...Object.fromEntries(names.map((n) => [n, function () {}])),
      document: { createElement: () => ({ getContext: () => (canvas ? {} : null) }) },
    }) as unknown as typeof globalThis;

  it("detecta las APIs esenciales y la exportación", () => {
    const full = detectBrowserSupport(fakeScope(["indexedDB", "Worker", "OffscreenCanvas", "VideoEncoder", "VideoDecoder"]));
    expect(missingEssentials(full)).toEqual([]);
    expect(canExport(full)).toBe(true);

    const old = detectBrowserSupport(fakeScope(["indexedDB", "Worker"], false));
    expect(missingEssentials(old)).toEqual(["Canvas 2D"]);
    expect(canExport(old)).toBe(false);
  });
});

describe("resolución del cursor en el inspector", async () => {
  const { inspectorPlayhead } = await import("@/features/editor/components/inspector/ClipInspector");
  const { createClip } = await import("@/core/project/factory");
  const s = (seconds: number) => Math.round(seconds * 1_000_000);
  const clip = createClip({ type: "video", name: "a", start: s(2), duration: s(4) });

  it("sin keyframes solo distingue dentro/fuera (no cambia durante la reproducción)", () => {
    const values = [2.1, 3, 4.5, 5.9].map((t) => inspectorPlayhead(clip, s(t), true));
    expect(new Set(values)).toEqual(new Set([s(2)]));
    expect(inspectorPlayhead(clip, s(1), false)).toBe(-1);
    expect(inspectorPlayhead(clip, s(7), true)).toBe(-1);
  });

  it("con keyframes: exacto en pausa y a 4 Hz mientras se reproduce", () => {
    const animated = { ...clip, keyframes: { x: [{ time: 0, value: 0, easing: "linear" as const }] } };
    expect(inspectorPlayhead(animated, s(3.1234), false)).toBe(s(3.1234));
    expect(inspectorPlayhead(animated, s(3.1), true)).toBe(s(3));
    expect(inspectorPlayhead(animated, s(3.24), true)).toBe(s(3));
    expect(inspectorPlayhead(animated, s(3.26), true)).toBe(s(3.25));
  });
});
