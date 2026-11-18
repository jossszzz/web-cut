import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/** Fase 4: preview y reproducción con medios reales. */

const fixture = (name: string) => path.join(__dirname, "fixtures", name);
const PX_PER_S = 80;

async function setupWithMedia(page: Page, files: string[]) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/projects");
  await page.getByLabel("Nombre").fill("Reproducción");
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Reproducción", level: 1 })).toBeVisible();
  await page.getByTestId("media-file-input").setInputFiles(files.map(fixture));
  await expect(page.getByRole("list", { name: "Medios importados" }).getByRole("listitem")).toHaveCount(files.length, {
    timeout: 20_000,
  });
  return errors;
}

/** Huella del contenido del canvas de preview. */
function previewHash(page: Page): Promise<string> {
  return page.getByTestId("preview-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    for (let i = 0; i < data.length; i += 97) hash = (hash * 31 + data[i]) | 0;
    return String(hash);
  });
}

/** Espera a que el canvas deje de cambiar (seek terminado y frame pintado). */
async function stableHash(page: Page): Promise<string> {
  let previous = "";
  let current = await previewHash(page);
  for (let i = 0; i < 20 && current !== previous; i++) {
    await page.waitForTimeout(150);
    previous = current;
    current = await previewHash(page);
  }
  return current;
}

async function clickRuler(page: Page, seconds: number) {
  await page.getByTestId("timeline-canvas").click({ position: { x: seconds * PX_PER_S, y: 10 } });
}

const timecode = (page: Page) => page.getByRole("status", { name: "Tiempo actual" }).or(page.locator("output[aria-label='Tiempo actual']"));

test("en pausa, el scrub muestra el fotograma real de cada instante del video", async ({ page }) => {
  const errors = await setupWithMedia(page, ["clip.webm"]);
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();

  await clickRuler(page, 0.3);
  const early = await stableHash(page);
  await clickRuler(page, 1.6);
  const late = await stableHash(page);
  await clickRuler(page, 0.3);
  const earlyAgain = await stableHash(page);

  expect(late).not.toBe(early); // distintos fotogramas, no una miniatura fija
  expect(earlyAgain).toBe(early); // el mismo instante produce el mismo fotograma
  expect(errors).toEqual([]);
});

test("reproduce el video, avanza el tiempo y se detiene al final", async ({ page }) => {
  const errors = await setupWithMedia(page, ["clip.webm"]);
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  await clickRuler(page, 0);

  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  await page.waitForTimeout(400);
  const a = await previewHash(page);
  await page.waitForTimeout(400);
  const b = await previewHash(page);
  expect(b).not.toBe(a); // el contenido cambia mientras se reproduce
  await expect(timecode(page)).not.toContainText("00:00:00:00 /");

  // Se detiene solo al llegar al final (2 s).
  await expect(page.getByRole("button", { name: "Reproducir" })).toBeVisible({ timeout: 5_000 });
  await expect(timecode(page)).toContainText("00:00:02:00 / 00:00:02:00");
  expect(errors).toEqual([]);
});

test("encadena clips y audio sin quedarse bloqueado", async ({ page }) => {
  const errors = await setupWithMedia(page, ["clip.webm", "tone.wav"]);
  // Dos clips de video seguidos (0–2 s y 2–4 s) y el audio (0–3 s).
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  await page.getByRole("button", { name: "Añadir tone.wav al timeline" }).click();
  await clickRuler(page, 0);

  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("button", { name: "Reproducir" })).toBeVisible({ timeout: 8_000 });
  await expect(timecode(page)).toContainText("00:00:04:00 / 00:00:04:00");
  await expect(page.getByTestId("preview-buffering")).toHaveCount(0);

  // Los elementos multimedia viven en un contenedor oculto y están en pausa.
  const media = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLMediaElement>("[data-webcut-media] video, [data-webcut-media] audio")).map(
      (el) => ({ tag: el.tagName, paused: el.paused }),
    ),
  );
  expect(media.length).toBeGreaterThanOrEqual(2);
  expect(media.every((m) => m.paused)).toBe(true);
  expect(errors).toEqual([]);
});

test("la calidad de la preview reduce la resolución del canvas", async ({ page }) => {
  await setupWithMedia(page, ["logo.png"]);
  await page.getByRole("button", { name: "Añadir logo.png al timeline" }).click();
  const canvas = page.getByTestId("preview-canvas");
  const full = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
  await page.getByLabel("Calidad de la vista previa").selectOption({ label: "Baja" });
  await expect(canvas).toHaveAttribute("data-scale", "0.25");
  const low = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
  expect(low).toBeLessThanOrEqual(Math.ceil(full / 4) + 1);
});

test("los elementos multimedia se liberan al salir del editor", async ({ page }) => {
  await setupWithMedia(page, ["clip.webm"]);
  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  await expect(page.locator("[data-webcut-media] video")).toHaveCount(1);
  await page.getByRole("link", { name: /volver a proyectos/ }).click();
  await expect(page.getByRole("heading", { name: "Proyectos", level: 1 })).toBeVisible();
  await expect(page.locator("[data-webcut-media]")).toHaveCount(0);
});
