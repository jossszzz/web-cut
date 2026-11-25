import { expect, test, type Page } from "@playwright/test";

/** Criterios de aceptación del Sprint 1. */

async function createProject(page: Page, name: string, template: "Proyecto vacío" | "Demostración") {
  await page.goto("/");
  await page.getByRole("link", { name: "Abrir el editor" }).first().click();
  await expect(page.getByRole("heading", { name: "Proyectos", level: 1 })).toBeVisible();
  await page.getByLabel("Nombre").fill(name);
  await page.getByText(template, { exact: true }).click();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(/\/editor\/[\w-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

test("crea un proyecto vacío 1920×1080 y muestra todos los paneles", async ({ page }) => {
  await createProject(page, "Mi primer video", "Proyecto vacío");

  await expect(page.getByRole("navigation", { name: "Herramientas" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Medios" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Vista previa" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Línea de tiempo" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  await expect(page.getByText("1920 × 1080 · 30 fps", { exact: true })).toBeVisible();

  const tracks = page.getByRole("list", { name: "Pistas" });
  for (const name of ["Texto", "Video 2", "Video 1", "Audio"]) {
    await expect(tracks.getByRole("button", { name, exact: true })).toBeVisible();
  }
});

test("selecciona pistas y clips y edita propiedades con deshacer", async ({ page }) => {
  await createProject(page, "Demo", "Demostración");
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  // Seleccionar una pista.
  await page.getByRole("list", { name: "Pistas" }).getByRole("button", { name: "Video 2", exact: true }).click();
  await expect(inspector.getByLabel("Nombre")).toHaveValue("Video 2");

  // Seleccionar un clip haciendo clic en el canvas del timeline: "Toma A" está
  // en Video 1 (tercera pista) entre 0 y 5 s a 80 px/s.
  const canvas = page.getByTestId("timeline-canvas");
  await canvas.click({ position: { x: 100, y: 28 + 2 * 52 + 24 } });
  await expect(inspector.getByLabel("Nombre")).toHaveValue("Toma A");

  // Cambiar una propiedad visual.
  const posX = inspector.getByLabel("Posición X", { exact: true });
  await posX.fill("250");
  await posX.press("Enter");
  await expect(posX).toHaveValue("250");

  // Deshacer y rehacer.
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(posX).toHaveValue("0");
  await page.getByRole("button", { name: "Rehacer" }).click();
  await expect(posX).toHaveValue("250");

  // Eliminar con teclado y deshacer con atajo.
  await canvas.click({ position: { x: 100, y: 28 + 2 * 52 + 24 } });
  await page.keyboard.press("Delete");
  // La selección queda en la pista del clip eliminado.
  await expect(inspector.getByRole("heading", { name: "Pista" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Toma A/ })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  // Alternativa accesible al canvas: activar el clip con teclado.
  await page.getByRole("button", { name: /Toma A/ }).focus();
  await page.keyboard.press("Enter");
  await expect(inspector.getByLabel("Nombre")).toHaveValue("Toma A");
});

test("añade un texto desde el panel de texto", async ({ page }) => {
  await createProject(page, "Con texto", "Proyecto vacío");
  await page.getByRole("navigation", { name: "Herramientas" }).getByRole("button", { name: "Texto" }).click();
  await page.getByRole("button", { name: "Añadir Título" }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByLabel("Contenido")).toHaveValue("Título");
  await expect(page.getByRole("button", { name: "Reproducir" })).toBeEnabled();
});

test("navega entre secciones de herramientas", async ({ page }) => {
  await createProject(page, "Navegación", "Proyecto vacío");
  const nav = page.getByRole("navigation", { name: "Herramientas" });
  for (const tool of ["Audio", "Efectos", "Transiciones", "Medios"]) {
    await nav.getByRole("button", { name: tool }).click();
    await expect(nav.getByRole("button", { name: tool })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: tool })).toBeVisible();
  }
});

test("muestra un estado claro si el proyecto no existe (tras recargar)", async ({ page }) => {
  await page.goto("/editor/inexistente");
  await expect(page.getByRole("heading", { name: "Proyecto no encontrado" })).toBeVisible();
});
