/** URL pública del sitio (para metadatos, sitemap y robots). Configurable al desplegar. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
