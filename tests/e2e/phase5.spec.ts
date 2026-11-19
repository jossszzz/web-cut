import { expect, test, type Page } from "@playwright/test";

/**
 * Fase 5: herramientas de edición. Proyecto de demostración a 80 px/s:
 *   Texto: Título 1–6 s · Video 2: Logo 2–8 s (x 700, y −340, 20 %) ·
 *   Video 1: Toma A 0–5 s, Toma B 5–11 s (fuente desde 2 s) · Audio: Música 0–11 s
 */
const PX_PER_S = 80;

async function openDemo(page: Page) {
  await page.goto("/projects");
  await page.getByLabel("Nombre").fill("Edición");
  await page.getByText("Demostración", { exact: true }).click();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Edición", level: 1 })).toBeVisible();
}

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const field = (page: Page, label: string) => inspector(page).getByLabel(label, { exact: true });
const clipsOf = (page: Page, track: string) => page.getByRole("list", { name: `Clips de ${track}` }).getByRole("button");

async function selectClip(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`^${name},`) }).first().focus();
  await page.keyboard.press("Enter");
  await expect(field(page, "Nombre")).toHaveValue(name);
}

async function setPlayhead(page: Page, seconds: number) {
  await page.getByTestId("timeline-canvas").click({ position: { x: seconds * PX_PER_S, y: 10 } });
}

async function setNumber(page: Page, label: string, value: string) {
  await field(page, label).fill(value);
  await field(page, label).press("Enter");
}

/** Color RGB del píxel en una posición relativa (0–1) del canvas de preview. */
function previewPixel(page: Page, fx: number, fy: number) {
  return page.getByTestId("preview-canvas").evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const data = canvas.getContext("2d")!.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
      return [data[0], data[1], data[2]];
    },
    [fx, fy],
  );
}

test("divide en el cursor con ⌘/Ctrl+B y se deshace", async ({ page }) => {
  await openDemo(page);
  await selectClip(page, "Toma A");
  await setPlayhead(page, 2);
  await page.keyboard.press("ControlOrMeta+b");
  await expect(clipsOf(page, "Video 1")).toHaveText([/^Toma A, 0:00.0 a 0:02.0/, /^Toma A, 0:02.0 a 0:05.0/, /^Toma B/]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(clipsOf(page, "Video 1")).toHaveCount(2);
});

test("Q y W eliminan a la izquierda y a la derecha del cursor", async ({ page }) => {
  await openDemo(page);
  await selectClip(page, "Toma B");
  await setPlayhead(page, 7);
  await page.keyboard.press("q");
  await expect(field(page, "Inicio")).toHaveValue("7");
  await expect(field(page, "Duración")).toHaveValue("4");
  await expect(inspector(page).getByText("00:00:04:00", { exact: true })).toBeVisible(); // inicio en fuente: 2 s + 2 s
  await setPlayhead(page, 7.5); // (el canvas mide ~640 px: 9 s quedaría fuera)
  await page.keyboard.press("w");
  await expect(field(page, "Duración")).toHaveValue("0.5");
});

test("la velocidad cambia la duración sin invadir el clip siguiente", async ({ page }) => {
  await openDemo(page);
  await selectClip(page, "Toma A");
  await inspector(page).getByRole("button", { name: "2×", exact: true }).click();
  await expect(field(page, "Duración")).toHaveValue("2.5");
  await inspector(page).getByRole("button", { name: "0.5×", exact: true }).click();
  await expect(field(page, "Duración")).toHaveValue("5"); // 10 s se limitarían por Toma B (5 s)
  await expect(inspector(page).getByRole("button", { name: "0.5×", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("ajusta el volumen de un clip de audio", async ({ page }) => {
  await openDemo(page);
  await selectClip(page, "Música");
  const slider = inspector(page).getByRole("slider", { name: "Volumen" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(inspector(page).getByText("200%")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(inspector(page).getByText("Silencio")).toBeVisible();
});

test("anima la posición con keyframes e interpola entre ellos", async ({ page }) => {
  await openDemo(page);
  await selectClip(page, "Logo");
  await setPlayhead(page, 3);
  const keyX = inspector(page).getByRole("button", { name: /keyframe de posición X/ });
  await keyX.click();
  await expect(keyX).toHaveAttribute("aria-pressed", "true");

  await setPlayhead(page, 6);
  await expect(keyX).toHaveAttribute("aria-pressed", "false");
  await setNumber(page, "Posición X", "0"); // crea el segundo keyframe automáticamente
  await expect(inspector(page).getByText("2 keyframes")).toBeVisible();

  await setPlayhead(page, 4.5);
  await expect(field(page, "Posición X")).toHaveValue("350");
  await inspector(page).getByRole("button", { name: "Keyframe anterior" }).click();
  await expect(field(page, "Posición X")).toHaveValue("700");
});

test("recorta el encuadre de una imagen (crop)", async ({ page }) => {
  await openDemo(page);
  await selectClip(page, "Logo");
  await setPlayhead(page, 3);
  // El logo está arriba a la derecha (x 700, y −340): su borde izquierdo desaparece al recortar.
  const probe: [number, number] = [0.5 + 650 / 1920, 0.5 - 340 / 1080];
  const before = await previewPixel(page, ...probe);
  const slider = inspector(page).getByRole("slider", { name: "Izquierda" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(inspector(page).getByText("90%")).toBeVisible();
  await expect.poll(() => previewPixel(page, ...probe)).not.toEqual(before);
});

test("aplica un fundido a negro en el corte entre dos clips", async ({ page }) => {
  await openDemo(page);
  // Ocultar las capas superiores para mirar solo Video 1.
  await page.getByRole("button", { name: "Ocultar Texto" }).click();
  await page.getByRole("button", { name: "Ocultar Video 2" }).click();

  await selectClip(page, "Toma B");
  await page.getByRole("navigation", { name: "Herramientas" }).getByRole("button", { name: "Transiciones" }).click();
  await page.getByRole("list", { name: "Transiciones" }).getByRole("button", { name: "Fundido a negro" }).click();
  await expect(inspector(page).getByLabel("Desde «Toma A»")).toHaveValue("fade");

  const brightness = async () => (await previewPixel(page, 0.5, 0.5)).reduce((a, b) => a + b, 0);
  await setPlayhead(page, 4);
  await expect.poll(brightness).toBeGreaterThan(100); // Toma A visible
  await setPlayhead(page, 5); // centro del fundido (0,6 s centrados en el corte)
  await expect.poll(brightness).toBeLessThan(20);
  await setPlayhead(page, 6);
  await expect.poll(brightness).toBeGreaterThan(100); // Toma B visible
});

test("mueve y escala un clip arrastrando en la preview", async ({ page }) => {
  await openDemo(page);
  await setPlayhead(page, 3);
  const canvas = page.getByTestId("preview-canvas");
  const box = (await canvas.boundingBox())!;
  const cs = box.width / 1920;
  const logo = { x: box.x + box.width / 2 + 700 * cs, y: box.y + box.height / 2 - 340 * cs };

  // Clic en el logo: lo selecciona.
  await page.mouse.click(logo.x, logo.y);
  await expect(field(page, "Nombre")).toHaveValue("Logo");

  // Arrastrar 40 px a la izquierda.
  await page.mouse.move(logo.x, logo.y);
  await page.mouse.down();
  await page.mouse.move(logo.x - 40, logo.y, { steps: 5 });
  await page.mouse.up();
  const x = Number(await field(page, "Posición X").inputValue());
  expect(x).toBeCloseTo(700 - 40 / cs, -1);

  // Un solo paso de deshacer para todo el arrastre.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(field(page, "Posición X")).toHaveValue("700");

  // Escalar desde la esquina inferior derecha (el logo mide 1920×1080 × 20 %).
  const half = { w: (1920 * 0.2 * cs) / 2, h: (1080 * 0.2 * cs) / 2 };
  const corner = { x: logo.x + half.w, y: logo.y + half.h };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + half.w, corner.y + half.h, { steps: 5 });
  await page.mouse.up();
  await expect(inspector(page).getByText("40%")).toBeVisible();
});
