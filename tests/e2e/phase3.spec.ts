import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Fase 3: timeline multipista. Proyecto de demostración a 80 px/s:
 *   fila 0 Texto    Título  1–6 s
 *   fila 1 Video 2  Logo    2–8 s
 *   fila 2 Video 1  Toma A  0–5 s, Toma B 5–11 s (fuente desde 2 s)
 *   fila 3 Audio    Música  0–11 s
 */
const PX_PER_S = 80;
const rowY = (row: number) => 28 + row * 52 + 24;
const xAt = (seconds: number) => seconds * PX_PER_S;

async function openDemo(page: Page) {
  await page.goto("/projects");
  await page.getByLabel("Nombre").fill("Timeline");
  await page.getByText("Demostración", { exact: true }).click();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Timeline", level: 1 })).toBeVisible();
}

/** Arrastra en el canvas entre dos puntos (coordenadas relativas al canvas). */
async function drag(page: Page, from: [number, number], to: [number, number], options: { alt?: boolean } = {}) {
  const box = (await page.getByTestId("timeline-canvas").boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  if (options.alt) await page.keyboard.down("Alt");
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
  await page.mouse.up();
  if (options.alt) await page.keyboard.up("Alt");
}

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const field = (page: Page, label: string): Locator => inspector(page).getByLabel(label, { exact: true });

async function expectClip(page: Page, name: string, start: string, duration?: string) {
  await expect(field(page, "Nombre")).toHaveValue(name);
  await expect(field(page, "Inicio")).toHaveValue(start);
  if (duration) await expect(field(page, "Duración")).toHaveValue(duration);
}

test("mueve un clip arrastrando y se deshace en un solo paso", async ({ page }) => {
  await openDemo(page);
  await drag(page, [xAt(5), rowY(1)], [xAt(6), rowY(1)]);
  await expectClip(page, "Logo", "3", "6");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(field(page, "Inicio")).toHaveValue("2");
});

test("el imán ajusta a los bordes de otros clips y Alt lo ignora", async ({ page }) => {
  await openDemo(page);
  // Fin del logo (8 s) + 2,95 s = 10,95 s → se imanta al final de Toma B (11 s).
  // Se agarra el logo cerca de su inicio para no acercarse al borde del canvas (auto-scroll).
  await drag(page, [xAt(3), rowY(1)], [xAt(3 + 2.95), rowY(1)]);
  await expectClip(page, "Logo", "5");

  await page.keyboard.press("ControlOrMeta+z");
  await drag(page, [xAt(3), rowY(1)], [xAt(3 + 2.95), rowY(1)], { alt: true });
  await expectClip(page, "Logo", "4.95");
});

test("mueve un clip a otra pista y lo coloca en el hueco libre más cercano", async ({ page }) => {
  await openDemo(page);
  // Toma B (5–11 s) sube a Video 2, donde 5 s está ocupado por el logo (2–8 s).
  await drag(page, [xAt(8), rowY(2)], [xAt(8), rowY(1)]);
  await expectClip(page, "Toma B", "8");
  await expect(inspector(page).getByText("en Video 2")).toBeVisible();
});

test("recorta bordes respetando vecinos y el material fuente", async ({ page }) => {
  await openDemo(page);
  // Borde final de Toma A (5 s) hacia 4 s.
  await page.getByRole("button", { name: /^Toma A,/ }).focus();
  await page.keyboard.press("Enter");
  await drag(page, [xAt(5) - 2, rowY(2)], [xAt(4) - 2, rowY(2)]);
  await expectClip(page, "Toma A", "0", "4");

  // Borde inicial de Toma B (5 s) hacia 4,03 s: se imanta al final de Toma A (4 s).
  await page.getByRole("button", { name: /^Toma B,/ }).focus();
  await page.keyboard.press("Enter");
  await drag(page, [xAt(5) + 2, rowY(2)], [xAt(4.03) + 2, rowY(2)]);
  await expectClip(page, "Toma B", "4", "7");
  // Toma B empezaba 2 s dentro de su fuente; ahora 1 s.
  await expect(inspector(page).getByText("00:00:01:00")).toBeVisible();

  // Con valores exactos desde el inspector: no puede solaparse con nada (tope en 11 s).
  await field(page, "Duración").fill("30");
  await field(page, "Duración").press("Enter");
  await expect(field(page, "Duración")).toHaveValue("30");
});

test("selecciona varios clips con un rectángulo y los mueve juntos", async ({ page }) => {
  await openDemo(page);
  // Desde un hueco de la fila Texto (0,25 s) hasta 6,25 s en la fila Video 2.
  await drag(page, [xAt(0.25), rowY(0) - 14], [xAt(6.25), rowY(1) + 14]);
  await expect(inspector(page).getByText("2 clips seleccionados")).toBeVisible();

  await drag(page, [xAt(3), rowY(0)], [xAt(4), rowY(0)]);
  await page.getByRole("button", { name: /^Logo,/ }).focus();
  await page.keyboard.press("Enter");
  await expectClip(page, "Logo", "3");
  await page.getByRole("button", { name: /^Título,/ }).focus();
  await page.keyboard.press("Enter");
  await expectClip(page, "Título", "2");
});

test("añade, elimina y reordena pistas", async ({ page }) => {
  await openDemo(page);
  const tracks = page.getByRole("list", { name: "Pistas" });
  const names = () => tracks.locator(":scope > li > button:first-child").allInnerTexts();

  await page.getByRole("button", { name: "Pista", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pista de video" }).click();
  await expect.poll(names).toEqual(["Texto", "Video 3", "Video 2", "Video 1", "Audio"]);
  await expect(field(page, "Nombre")).toHaveValue("Video 3");

  await inspector(page).getByRole("button", { name: "Eliminar pista" }).click();
  await expect.poll(names).toEqual(["Texto", "Video 2", "Video 1", "Audio"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(names).toEqual(["Texto", "Video 3", "Video 2", "Video 1", "Audio"]);

  // Reordenar con teclado: Audio sube una posición.
  // dnd-kit activa sus atajos tras iniciar el arrastre: se espera a que esté activo.
  const audioHandle = page.getByRole("button", { name: "Reordenar Audio" });
  await audioHandle.focus();
  await page.keyboard.press("Space");
  await expect(audioHandle).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(50);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250); // animación del reordenamiento
  await page.keyboard.press("Space");
  await expect.poll(names).toEqual(["Texto", "Video 3", "Video 2", "Audio", "Video 1"]);

  // Reordenar con ratón: Texto baja al final.
  const handle = page.getByRole("button", { name: "Reordenar Texto" });
  const target = page.getByRole("button", { name: "Reordenar Video 1" });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 10, { steps: 12 });
  await page.mouse.up();
  await expect.poll(names).toEqual(["Video 3", "Video 2", "Audio", "Video 1", "Texto"]);
});

test("Esc cancela un arrastre sin modificar el proyecto", async ({ page }) => {
  await openDemo(page);
  const box = (await page.getByTestId("timeline-canvas").boundingBox())!;
  await page.mouse.move(box.x + xAt(5), box.y + rowY(1));
  await page.mouse.down();
  await page.mouse.move(box.x + xAt(7), box.y + rowY(1), { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expectClip(page, "Logo", "2");
  await expect(page.getByRole("button", { name: "Deshacer" })).toBeDisabled();
});
