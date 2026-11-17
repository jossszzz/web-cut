/**
 * Ajusta el tamaño del backing store de un canvas a su tamaño CSS y al
 * devicePixelRatio. Devuelve un contexto 2D escalado a píxeles CSS.
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}

const fontCache = new Map<string, string>();

/**
 * `ctx.font` no resuelve variables CSS; obtiene la familia real de una
 * variable (p. ej. la definida por next/font) con un respaldo.
 */
export function cssFontFamily(variable: string, fallback: string): string {
  const cached = fontCache.get(variable);
  if (cached) return cached;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const family = value ? `${value}, ${fallback}` : fallback;
  fontCache.set(variable, family);
  return family;
}

export const sansFont = () => cssFontFamily("--font-geist-sans", "system-ui, sans-serif");
export const monoFont = () => cssFontFamily("--font-geist-mono", "ui-monospace, monospace");
