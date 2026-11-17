import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/** Fase 2: importación, biblioteca y persistencia local. */

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function createEmptyProject(page: Page, name: string) {
  await page.goto("/projects");
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(/\/editor\/[\w-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

const library = (page: Page) => page.getByRole("list", { name: "Medios importados" });

test("importa video, audio e imagen con metadatos y miniaturas, y rechaza formatos no válidos", async ({ page }) => {
  await createEmptyProject(page, "Importación");
  await page
    .getByTestId("media-file-input")
    .setInputFiles([fixture("clip.webm"), fixture("tone.wav"), fixture("logo.png"), fixture("notes.txt")]);

  await expect(library(page).getByRole("listitem")).toHaveCount(3, { timeout: 20_000 });

  // Metadatos: duración del video y del audio, dimensiones de la imagen.
  const video = library(page).getByRole("listitem").filter({ hasText: "clip.webm" });
  await expect(video).toContainText("0:02.0");
  await expect(video.locator("img")).toHaveAttribute("src", /^blob:/);
  await expect(library(page).getByRole("listitem").filter({ hasText: "tone.wav" })).toContainText("0:03.0");
  await expect(library(page).getByRole("listitem").filter({ hasText: "logo.png" }).locator("img")).toBeVisible();

  // El .txt queda como error descartable en la cola.
  const imports = page.getByRole("list", { name: "Importaciones" });
  await expect(imports).toContainText("Formato no compatible");
  await imports.getByRole("button", { name: /Descartar error/ }).click();
  await expect(imports).toHaveCount(0);
});

test("añade medios al timeline y todo persiste al recargar", async ({ page }) => {
  await createEmptyProject(page, "Persistencia");
  await page.getByTestId("media-file-input").setInputFiles([fixture("clip.webm"), fixture("tone.wav")]);
  await expect(library(page).getByRole("listitem")).toHaveCount(2, { timeout: 20_000 });

  await page.getByRole("button", { name: "Añadir clip.webm al timeline" }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByLabel("Nombre")).toHaveValue("clip");
  await expect(inspector.getByLabel("Duración", { exact: true })).toHaveValue("2"); // Duración real del archivo.

  // Arrastrar el audio desde la biblioteca a la pista de audio.
  const timeline = page.getByTestId("timeline-canvas");
  await library(page)
    .getByRole("listitem")
    .filter({ hasText: "tone.wav" })
    .locator("[draggable=true]")
    .dragTo(timeline, { targetPosition: { x: 120, y: 28 + 3 * 52 + 24 } });
  await expect(inspector.getByLabel("Nombre")).toHaveValue("tone");

  await expect(page.getByRole("status").filter({ hasText: "Guardado" })).toBeVisible();
  await page.reload();

  await expect(page.getByRole("heading", { name: "Persistencia", level: 1 })).toBeVisible();
  await expect(library(page).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Clips de Video 1" }).getByRole("button")).toHaveText([/^clip,/]);
  await expect(page.getByRole("list", { name: "Clips de Audio" }).getByRole("button")).toHaveText([/^tone,/]);
});

test("no permite borrar un medio en uso y sí uno sin usar", async ({ page }) => {
  await createEmptyProject(page, "Borrado");
  await page.getByTestId("media-file-input").setInputFiles([fixture("logo.png"), fixture("tone.wav")]);
  await expect(library(page).getByRole("listitem")).toHaveCount(2, { timeout: 20_000 });
  await page.getByRole("button", { name: "Añadir logo.png al timeline" }).click();

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar logo.png" }).click();
  await expect(page.getByRole("complementary", { name: "Medios" }).getByRole("alert")).toContainText("Se usa en 1 clip");

  await page.getByRole("button", { name: "Eliminar tone.wav" }).click();
  await expect(library(page).getByRole("listitem")).toHaveCount(1);
});

test("lista proyectos guardados tras recargar y permite eliminarlos", async ({ page }) => {
  await createEmptyProject(page, "Para borrar");
  await page.goto("/projects");
  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: "Para borrar" });
  await expect(row).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Eliminar Para borrar" }).click();
  await expect(page.getByText("Todavía no hay proyectos.")).toBeVisible();
});

test("importa MP4 H.264 (vía WebCodecs o el respaldo nativo)", async ({ page, browserName }) => {
  await createEmptyProject(page, "MP4");
  await page.getByTestId("media-file-input").setInputFiles(fixture("clip.mp4"));
  const imports = page.getByRole("list", { name: "Importaciones" });
  const card = library(page).getByRole("listitem").filter({ hasText: "clip.mp4" });

  // Chromium de Playwright no incluye códecs propietarios: en ese caso se espera un error claro.
  await expect(card.or(imports.getByText("no puede leer"))).toBeVisible({ timeout: 20_000 });
  test.info().annotations.push({
    type: "h264",
    description: `${browserName}: ${(await card.count()) > 0 ? "importado" : "no soportado (error mostrado)"}`,
  });
});
