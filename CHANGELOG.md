# Changelog

## 0.1.0 — Beta pública (MVP)

Primera versión publicable de WebCut Studio.

- **Proyectos** guardados en el navegador (IndexedDB) con autoguardado y plantilla de demostración.
- **Importación** de video, audio e imagen con metadatos y miniaturas en un Web Worker (Mediabunny + WebCodecs).
- **Timeline multipista** en Canvas: mover, recortar, imán, selección múltiple, zoom, pistas reordenables.
- **Preview** sincronizada con audio, controles de transformación directamente sobre la imagen.
- **Edición**: dividir, recortar hasta el cursor, crop, velocidad, volumen, keyframes y transiciones.
- **Exportación MP4** en un worker (H.264/AAC cuando está disponible), con progreso, cancelación y errores recuperables.
- **Optimización**: miniaturas pequeñas para el timeline, caché de imágenes con presupuesto de memoria,
  carga diferida de paneles y del diálogo de exportación, liberación de recursos al salir del editor.
- **Compatibilidad**: Chromium (Chrome/Edge) y WebKit (Safari) verificados con pruebas automáticas;
  respaldos para Safari en navegación privada.
- **Landing page**, metadatos SEO, `robots.txt` y `sitemap.xml`.
