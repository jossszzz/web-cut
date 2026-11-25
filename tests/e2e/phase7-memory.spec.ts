import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Fase 7: pruebas de memoria y liberación de recursos.
 *
 * Un script inyectado contabiliza los recursos nativos que crea la página
 * (object URLs, workers, ImageBitmap) para comprobar que se liberan al salir
 * del editor. En Chromium además se mide el heap de JS tras forzar el GC.
 */

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

interface ResourceCounts {
  urls: number;
  workers: number;
  bitmaps: number;
  media: number;
}

async function trackResources(page: Page) {
  await page.addInitScript(() => {
    const live = { urls: new Set<string>(), workers: new Set<Worker>(), bitmaps: new Set<ImageBitmap>() };
    (window as unknown as { __resources: typeof live }).__resources = live;

    const createURL = URL.createObjectURL.bind(URL);
    const revokeURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = createURL(obj);
      live.urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      live.urls.delete(url);
      revokeURL(url);
    };

    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        live.workers.add(this);
      }
      terminate() {
        live.workers.delete(this);
        super.terminate();
      }
    };

    const nativeCreate = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      const bitmap = await nativeCreate(...args);
      live.bitmaps.add(bitmap);
      return bitmap;
    }) as typeof createImageBitmap;
    const nativeClose = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function close(this: ImageBitmap) {
      live.bitmaps.delete(this);
      nativeClose.call(this);
    };
  });
}

function counts(page: Page): Promise<ResourceCounts> {
  return page.evaluate(() => {
    const live = (window as unknown as { __resources: { urls: Set<string>; workers: Set<Worker>; bitmaps: Set<ImageBitmap> } })
      .__resources;
    return {
      urls: live.urls.size,
      workers: live.workers.size,
      bitmaps: live.bitmaps.size,
      media: document.querySelectorAll("[data-webcut-media] video, [data-webcut-media] audio").length,
    };
  });
}

async function createProject(page: Page, name: string) {
  await page.goto("/projects");
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** Usa el editor a fondo: importa, monta, reproduce y exporta. */
async function exerciseEditor(page: Page, withImport: boolean) {
  if (withImport) {
    await page.getByTestId("media-file-input").setInputFiles(["clip.webm", "tone.wav", "logo.png"].map(fixture));
    await expect(page.getByRole("list", { name: "Medios importados" }).getByRole("listitem")).toHaveCount(3, {
      timeout: 20_000,
    });
  }
  for (const name of ["clip.webm", "logo.png", "tone.wav"]) {
    await page.getByRole("button", { name: `Añadir ${name} al timeline` }).click();
  }
  await page.getByTestId("timeline-canvas").click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Reproducir" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Pausar" }).click();

  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Exportar video" });
  await dialog.getByLabel("Resolución").selectOption({ label: "480p" });
  await dialog.getByRole("button", { name: "Exportar MP4" }).click();
  await expect(dialog.getByText(/Exportación completada/)).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

async function leaveEditor(page: Page) {
  await page.getByRole("link", { name: "WebCut Studio — volver a proyectos" }).click();
  await expect(page.getByRole("heading", { name: "Proyectos", level: 1 })).toBeVisible();
}

test("al salir del editor se liberan object URLs, workers, bitmaps y elementos multimedia", async ({ page }) => {
  await trackResources(page);
  await createProject(page, "Recursos");
  await exerciseEditor(page, true);

  const during = await counts(page);
  expect(during.urls).toBeGreaterThan(0); // la prueba mide algo real
  expect(during.workers).toBeGreaterThan(0);
  expect(during.media).toBeLessThanOrEqual(8); // límite del motor de reproducción

  await leaveEditor(page);
  await expect.poll(() => counts(page)).toEqual({ urls: 0, workers: 0, bitmaps: 0, media: 0 });
});

test("el heap no crece tras varios ciclos de edición y exportación", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "La medición del heap usa el protocolo de DevTools de Chromium");
  test.setTimeout(180_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const heapAfterGc = async () => {
    for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
    const { metrics } = await cdp.send("Performance.getMetrics");
    return metrics.find((m) => m.name === "JSHeapUsedSize")!.value / 1024 / 1024;
  };

  await createProject(page, "Ciclo 0");
  await exerciseEditor(page, true);
  await leaveEditor(page);
  const baseline = await heapAfterGc();

  for (let cycle = 1; cycle <= 3; cycle++) {
    await page.getByRole("link", { name: /^Ciclo 0/ }).first().click();
    await expect(page.getByRole("heading", { name: "Ciclo 0", level: 1 })).toBeVisible();
    await exerciseEditor(page, false);
    await leaveEditor(page);
  }
  const after = await heapAfterGc();
  console.log(`Heap tras GC: ${baseline.toFixed(1)} MB → ${after.toFixed(1)} MB`);
  expect(after - baseline).toBeLessThan(8);
});

test("durante la reproducción el timeline no se repinta entero en cada frame", async ({ page }) => {
  await page.goto("/projects");
  await page.getByLabel("Nombre").fill("Rendimiento");
  await page.getByText("Demostración", { exact: true }).click();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Rendimiento", level: 1 })).toBeVisible();

  const timeline = page.getByTestId("timeline-canvas");
  await page.waitForTimeout(500);
  const before = Number(await timeline.getAttribute("data-draws"));
  await page.getByRole("button", { name: "Reproducir" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Pausar" }).click();
  const after = Number(await timeline.getAttribute("data-draws"));
  // ~45 frames reproducidos; antes del cambio el timeline completo se repintaba en cada uno.
  expect(after - before).toBeLessThanOrEqual(3);
  await expect(page.getByRole("status", { name: "Tiempo actual" }).or(page.locator("output[aria-label='Tiempo actual']"))).not.toContainText(
    "00:00:00:00 /",
  );
});
