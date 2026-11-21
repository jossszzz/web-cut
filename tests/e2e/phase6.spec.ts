import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";

/** Fase 6: exportación MP4 real (WebCodecs + Mediabunny en un worker). */

const fixture = (name: string) => path.join(__dirname, "fixtures", name);
const PX_PER_S = 80;

async function createProject(page: Page, name: string, demo = false) {
  await page.goto("/projects");
  await page.getByLabel("Nombre").fill(name);
  if (demo) await page.getByText("Demostración", { exact: true }).click();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

async function importMedia(page: Page, files: string[]) {
  await page.getByTestId("media-file-input").setInputFiles(files.map(fixture));
  await expect(page.getByRole("list", { name: "Medios importados" }).getByRole("listitem")).toHaveCount(files.length, {
    timeout: 20_000,
  });
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Exportar video" });

async function openExport(page: Page) {
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByTestId("export-format")).toContainText("MP4", { timeout: 15_000 });
}

async function exportAndDownload(page: Page) {
  await dialog(page).getByRole("button", { name: "Exportar MP4" }).click();
  await expect(dialog(page).getByText(/Exportación completada/)).toBeVisible({ timeout: 90_000 });
  const download = page.waitForEvent("download");
  await dialog(page).getByRole("button", { name: "Descargar" }).click();
  const file = await download;
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

/** Lee el MP4 exportado con Mediabunny (demux en Node, sin decodificar). */
async function inspectMp4(bytes: Buffer) {
  const input = new Input({ source: new BufferSource(new Uint8Array(bytes)), formats: ALL_FORMATS });
  const format = await input.getFormat();
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const result = {
    mimeType: format.mimeType,
    duration: await input.computeDuration(),
    video: video && { codec: video.codec, width: video.displayWidth, height: video.displayHeight },
    audio: audio && { codec: audio.codec, channels: audio.numberOfChannels, sampleRate: audio.sampleRate },
    frames: video ? (await video.computePacketStats()).packetCount : 0,
  };
  input.dispose();
  return result;
}

/**
 * Diferencia media (0–255) entre la preview y el fotograma exportado en el
 * mismo instante, ambos reducidos a una cuadrícula pequeña.
 */
async function previewVsExport(page: Page, seconds: number): Promise<number> {
  return page.evaluate(async (time) => {
    const W = 48;
    const H = 27;
    const sample = (source: CanvasImageSource) => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, 0, 0, W, H);
      return ctx.getImageData(0, 0, W, H).data;
    };
    const video = document.querySelector<HTMLVideoElement>("[data-testid=export-result-video]")!;
    if (video.readyState < 2) await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }));
    await new Promise((resolve) => {
      video.addEventListener("seeked", resolve, { once: true });
      video.currentTime = time;
    });
    const exported = sample(video);
    const preview = sample(document.querySelector<HTMLCanvasElement>("[data-testid=preview-canvas]")!);
    let sum = 0;
    for (let i = 0; i < exported.length; i += 4) {
      for (let c = 0; c < 3; c++) sum += Math.abs(exported[i + c] - preview[i + c]);
    }
    return sum / ((exported.length / 4) * 3);
  }, seconds);
}

test("exporta el proyecto de demostración a MP4 igual que la preview", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createProject(page, "Demo exportada", true);
  await page.getByTestId("timeline-canvas").click({ position: { x: 3 * PX_PER_S, y: 10 } });
  await page.keyboard.press("Escape"); // sin controles de selección en la preview

  await openExport(page);
  await expect(dialog(page).getByRole("list", { name: "Avisos de exportación" })).toContainText("marcadores de prueba");
  const { name, bytes } = await exportAndDownload(page);

  expect(name).toBe("Demo-exportada.mp4");
  const info = await inspectMp4(bytes);
  expect(info.mimeType).toContain("video/mp4");
  expect(info.video).toMatchObject({ width: 1920, height: 1080 });
  expect(info.duration).toBeCloseTo(11, 1);
  expect(info.frames).toBe(330); // 11 s × 30 fps
  expect(info.audio).toBeNull(); // la demo no tiene medios con sonido

  // Calidad: el fotograma exportado en 3 s coincide con la preview (texto, logo y toma).
  expect(await previewVsExport(page, 3 + 1 / 60)).toBeLessThan(10);
  expect(errors).toEqual([]);
});

test("exporta video y audio reales a 480p con la duración correcta", async ({ page }) => {
  await createProject(page, "Con medios");
  await importMedia(page, ["clip.webm", "tone.wav"]);
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  await page.getByRole("button", { name: "Añadir tone.wav al timeline" }).click();
  await page.getByTestId("timeline-canvas").click({ position: { x: 1 * PX_PER_S, y: 10 } });
  await page.keyboard.press("Escape");

  await openExport(page);
  await dialog(page).getByLabel("Resolución").selectOption({ label: "480p" });
  await expect(dialog(page).getByTestId("export-format")).toContainText("+", { timeout: 15_000 }); // con códec de audio
  const { bytes } = await exportAndDownload(page);

  const info = await inspectMp4(bytes);
  expect(info.video).toMatchObject({ width: 854, height: 480 });
  expect(info.duration).toBeCloseTo(4, 1);
  expect(info.frames).toBe(Math.ceil(info.duration * 30 - 1e-6)); // cada frame del timeline, sin huecos
  expect(info.audio).toMatchObject({ channels: 2, sampleRate: 48_000 });
  expect(["aac", "opus"]).toContain(info.audio!.codec);

  // El fotograma real del video coincide con la preview en el mismo instante
  // (el video de prueba tiene ruido que la compresión no conserva) y se parece
  // más que el de un instante vecino: no hay desfase de frames.
  const same = await previewVsExport(page, 1 + 1 / 60);
  const neighbour = await previewVsExport(page, 0.9);
  expect(same).toBeLessThan(18);
  expect(same).toBeLessThan(neighbour - 3);

  // Con la pista del video silenciada (clip.webm también tiene sonido), el
  // audio exportado suena donde está el tono (0–3 s) y hay silencio después.
  await dialog(page).getByRole("button", { name: "Exportar de nuevo" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Silenciar Video 1" }).click();
  await openExport(page);
  await dialog(page).getByLabel("Resolución").selectOption({ label: "480p" });
  await exportAndDownload(page);
  const levels = await page.evaluate(async () => {
    const url = document.querySelector<HTMLVideoElement>("[data-testid=export-result-video]")!.src;
    const context = new OfflineAudioContext(2, 48_000, 48_000);
    const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const rms = (from: number, to: number) => {
      const data = buffer.getChannelData(0).subarray(Math.floor(from * buffer.sampleRate), Math.floor(to * buffer.sampleRate));
      return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
    };
    return { tone: rms(0.5, 2.5), silence: rms(3.2, 3.9) };
  });
  expect(levels.tone).toBeGreaterThan(0.05);
  expect(levels.silence).toBeLessThan(0.005);
});

test("las transiciones se exportan igual que en la preview", async ({ page }) => {
  await createProject(page, "Con fundido", true);
  await page.getByRole("button", { name: /^Toma B,/ }).first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("navigation", { name: "Herramientas" }).getByRole("button", { name: "Transiciones" }).click();
  await page.getByRole("list", { name: "Transiciones" }).getByRole("button", { name: "Fundido a negro" }).click();
  await page.getByTestId("timeline-canvas").click({ position: { x: 4.9 * PX_PER_S, y: 10 } });
  await page.keyboard.press("Escape");

  await openExport(page);
  await exportAndDownload(page);
  // A mitad del fundido de salida (4,7–5 s) la imagen está oscurecida igual en ambos.
  expect(await previewVsExport(page, 4.9 + 1 / 60)).toBeLessThan(10);
});

test("se puede cancelar y volver a exportar", async ({ page }) => {
  await createProject(page, "Cancelar", true);
  await openExport(page);
  await dialog(page).getByRole("button", { name: "Exportar MP4" }).click();
  await expect(dialog(page).getByRole("progressbar", { name: "Progreso de la exportación" })).toBeVisible();
  // Mientras exporta, el diálogo no se cierra con Esc.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeVisible();

  await dialog(page).getByRole("button", { name: "Cancelar exportación" }).click();
  await expect(dialog(page).getByText("Exportación cancelada.")).toBeVisible({ timeout: 10_000 });
  await dialog(page).getByRole("button", { name: "Volver a los ajustes" }).click();
  await expect(dialog(page).getByRole("button", { name: "Exportar MP4" })).toBeEnabled({ timeout: 15_000 });
});

test("un medio que falta da un error recuperable que lleva al clip", async ({ page }) => {
  await createProject(page, "Sin archivo");
  await importMedia(page, ["clip.webm"]);
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  await page.keyboard.press("Escape");

  // Simula que el navegador ha borrado el archivo guardado.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("webcut-studio");
        request.onsuccess = () => {
          const tx = request.result.transaction("blobs", "readwrite");
          tx.objectStore("blobs").clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );

  await openExport(page);
  await dialog(page).getByRole("button", { name: "Exportar MP4" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Falta el archivo de «clip»", { timeout: 20_000 });
  await dialog(page).getByRole("button", { name: "Ir al clip" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Inspector" }).getByLabel("Nombre", { exact: true })).toHaveValue("clip");
});
