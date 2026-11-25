# Despliegue

WebCut Studio no tiene backend propio: es una aplicación Next.js cuyo trabajo (importación, edición,
exportación) ocurre en el navegador. Basta con alojar la app de Next.js.

## Requisitos

- Node.js 22 o superior y pnpm (la versión exacta está en `packageManager` de `package.json`).
- HTTPS en producción: OPFS, WebCodecs y el almacenamiento persistente requieren un contexto seguro
  (`localhost` también cuenta como seguro).

## Variables de entorno

| Variable | Uso | Ejemplo |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL pública para metadatos (Open Graph), `robots.txt` y `sitemap.xml`. | `https://webcut.example.com` |

Al ser `NEXT_PUBLIC_*`, se incrusta al compilar: definirla **antes** de `pnpm build`.

## Opción A: Vercel (recomendada)

1. Sube el repositorio a GitHub (`git push -u origin main`).
2. En Vercel, **Add New → Project** e importa el repositorio. Detecta Next.js y pnpm automáticamente.
3. En **Environment Variables**, añade `NEXT_PUBLIC_SITE_URL` con el dominio final.
4. **Deploy**. Cada push a `main` vuelve a desplegar; los pull requests obtienen una URL de preview.

## Opción B: servidor propio (Node)

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_SITE_URL=https://webcut.example.com pnpm build
pnpm start --port 3000      # detrás de un proxy con HTTPS (nginx, Caddy…)
```

## Cabeceras

`next.config.ts` añade cabeceras de seguridad básicas (`X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy`). No hay todavía una Content-Security-Policy: si se añade, debe
permitir `worker-src 'self' blob:`, `media-src 'self' blob:` e `img-src 'self' blob: data:`.

No hacen falta las cabeceras COOP/COEP (aislamiento cross-origin): la app no usa `SharedArrayBuffer`.

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada push y pull request:

1. Lint, comprobación de tipos y pruebas unitarias.
2. Pruebas E2E de Playwright en Chromium, WebKit y Firefox (Firefox, de momento, sin bloquear).

Si una prueba E2E falla, los resultados (capturas y trazas) quedan como artefacto del job durante 7 días.

## Lista de comprobación antes de publicar

- [ ] CI en verde en `main`.
- [ ] `NEXT_PUBLIC_SITE_URL` configurada con el dominio real.
- [ ] Probar en el dominio final: crear proyecto, importar un MP4, exportar y descargar.
- [ ] Revisar la landing y `https://<dominio>/robots.txt`.
