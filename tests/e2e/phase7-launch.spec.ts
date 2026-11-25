import { expect, test } from "@playwright/test";

/** Fase 7: landing page, SEO y avisos de compatibilidad. */

test("la landing presenta el producto y lleva al editor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("WebCut Studio — Editor de video en el navegador");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edita video en tu navegador. Sin subir nada.");
  for (const section of ["Todo lo necesario para montar un video", "Privado por diseño", "Compatibilidad"]) {
    await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
  }
  await expect(page.getByRole("table").getByRole("rowheader")).toHaveText(["Chrome / Edge", "Safari 16.4+", "Firefox 130+"]);

  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Privacidad" }).click();
  await expect(page).toHaveURL(/#privacidad$/);

  await page.getByRole("link", { name: "Empezar a editar" }).click();
  await expect(page.getByRole("heading", { name: "Proyectos", level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("robots y sitemap; las páginas privadas no se indexan", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /editor/");
  expect(robots).toContain("Sitemap:");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<urlset");

  await page.goto("/projects");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("avisa si el navegador no puede exportar", async ({ page }) => {
  await page.addInitScript(() => {
    // Simula un navegador sin WebCodecs.
    Object.defineProperty(window, "VideoEncoder", { value: undefined, configurable: true });
  });
  await page.goto("/projects");
  await expect(page.getByRole("status").filter({ hasText: "no podrá exportar a MP4" })).toBeVisible();
});
