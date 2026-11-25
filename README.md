# WebCut Studio

Editor de video web, **local-first** y **browser-based**. La especificación completa está en
[`docs/arquitectura-roadmap.md`](docs/arquitectura-roadmap.md).

> Estado: **v0.1.0 — MVP** (Fases 1–7 completadas). Guía de usuario:
> [`docs/guia-de-usuario.md`](docs/guia-de-usuario.md) · Despliegue: [`docs/despliegue.md`](docs/despliegue.md) ·
> Cambios: [`CHANGELOG.md`](CHANGELOG.md).

## Requisitos

- Node.js 22 o superior
- pnpm

## Comandos

```bash
pnpm install
pnpm dev              # http://localhost:3000
pnpm build && pnpm start

pnpm lint
pnpm typecheck
pnpm test             # pruebas unitarias (Vitest)
pnpm exec playwright install chromium   # solo la primera vez
pnpm test:e2e         # pruebas E2E (Playwright, compila y arranca la app) — pesado
pnpm exec playwright test --project=chromium tests/e2e/phase6.spec.ts   # un solo archivo/navegador
```

La suite E2E completa (Chromium, WebKit y Firefox) se ejecuta en GitHub Actions en cada push
(`.github/workflows/ci.yml`). En local conviene lanzar solo lo que se esté tocando: exportar video es
intensivo para la CPU.

## Fase 7: optimización y lanzamiento

- **Memoria**: las imágenes de la preview tienen un presupuesto (≈ 48 MP); al superarlo se liberan las
  menos usadas (LRU) y se recargan al necesitarlas. Al salir del editor se liberan bitmaps, object URLs,
  el archivo exportado (memoria y OPFS) y los workers; el worker de medios se cierra tras 30 s sin uso.
- **Pruebas de memoria** (`tests/e2e/phase7-memory.spec.ts`): un script contabiliza object URLs, workers,
  `ImageBitmap` y elementos multimedia vivos y comprueba que vuelven a cero al salir del editor (encontró y
  se corrigió una fuga del archivo exportado). En Chromium se mide además el heap tras forzar el GC a lo
  largo de varios ciclos de edición y exportación (+1,4 MB en 3 ciclos).
- **Miniaturas**: el timeline usa bitmaps pequeños (96 px de alto) en lugar de la imagen original (hasta
  4K); las miniaturas de imágenes se guardan en WebP (con transparencia) cuando el navegador lo admite; las
  tarjetas de la biblioteca cargan sus imágenes en diferido.
- **CPU durante la reproducción**: el cursor del timeline va en un canvas superpuesto (los clips no se
  repintan en cada frame); el motor publica el tiempo una vez por frame del proyecto (no a la frecuencia
  de la pantalla, hasta 120 Hz); los paneles se suscriben a datos derivados (¿se puede editar en el
  cursor?, número de frame, dentro/fuera del clip) y el inspector refresca los valores animados a 4 Hz
  mientras se reproduce. Una prueba E2E comprueba que el timeline no se repinta entero al reproducir.
- **Carga diferida**: Mediabunny solo se carga en los workers; el contenido del diálogo de exportación y los
  paneles de Texto y Transiciones se descargan al abrirlos.
- **Navegadores**: suite E2E en Chromium (Chrome/Edge) y WebKit (Safari). Arreglos para WebKit: respaldo
  `ArrayBuffer` cuando IndexedDB no acepta `Blob` (Safari en navegación privada), exportación en memoria si
  OPFS falla y formularios deshabilitados hasta la hidratación (antes se podía perder lo escrito). Aviso en
  *Proyectos* si al navegador le faltan APIs para editar o exportar.
- **Landing page** con funciones, privacidad y compatibilidad; metadatos Open Graph, `robots.txt`,
  `sitemap.xml` y `noindex` en las páginas privadas; cabeceras de seguridad básicas.
- **Documentación** de usuario y de despliegue, CI en GitHub Actions y `CHANGELOG.md`.

## Fase 6: exportación MP4

- Botón **Exportar** → diálogo con resolución (la del proyecto, 4K, 1080p, 720p, 480p; nunca por
  encima del proyecto, conservando la proporción), fotogramas por segundo y calidad.
- **Detección de capacidades**: antes de exportar se comprueba WebCodecs y qué códecs puede
  codificar el navegador para ese tamaño. Preferencia: H.264 (+ AAC); si no, H.265/VP9/AV1 en MP4
  (+ Opus). Sin códec de audio se exporta sin sonido, con aviso.
- **Composición frame a frame en un Web Worker** (`export.worker.ts`) con el mismo compositor que la
  preview (`features/render/compositor.ts`): capas, keyframes, crop y transiciones salen idénticos.
  Los textos y marcadores se prerenderizan en el hilo principal (tipografía de la app) y se
  transfieren como `ImageBitmap`.
- **Decodificación** secuencial con Mediabunny (`VideoSampleSink`/`AudioSampleSink`): cada paquete se
  decodifica una vez; los lectores se abren al entrar el clip y se cierran al salir.
- **Audio**: mezcla por bloques de 0,25 s a 48 kHz estéreo (volumen por clip, pistas silenciadas,
  velocidad, rampas de 4 ms anti-chasquidos y limitación a [-1, 1]).
- **Codificación y multiplexado MP4** con Mediabunny respetando la contrapresión del codificador. El
  archivo se escribe directamente en disco (OPFS, `FileSystemSyncAccessHandle`) cuando el navegador
  lo permite, así que la memoria no crece con la duración; si no, en memoria.
- **Progreso** (fase, frame actual, tiempo restante), **cancelación** (y si el worker no responde en
  5 s, se termina) y **errores recuperables** con mensaje claro: medio que falta o no
  decodificable (con botón *Ir al clip*), sin espacio, fallo del codificador o caída del worker.
  Se puede reintentar sin recargar.
- Al terminar: vista previa del resultado, tamaño y **Descargar**.
- **Pruebas de calidad de salida** (E2E): el MP4 se analiza con Mediabunny (códec, tamaño, duración,
  número de frames, pistas de audio); un fotograma exportado se compara con la preview en el mismo
  instante (sin desfase, también en mitad de una transición) y se mide el nivel del audio
  exportado donde hay sonido y donde debe haber silencio.

## Fase 5: herramientas de edición

- **Dividir** en el cursor (⌘/Ctrl+B o tijeras): los clips seleccionados o, si no hay selección,
  todos los que estén bajo el cursor. La mitad derecha continúa en el punto correcto de la fuente.
- **Recortar hasta el cursor**: Q elimina lo que queda a la izquierda y W lo de la derecha.
- **Crop** por los cuatro lados (video e imagen), en el inspector.
- **Resize, rotación y posición** con el ratón directamente en la preview: arrastrar mueve (⇧ fija
  el eje), las esquinas escalan y el asa superior rota (⇧ en pasos de 15°). Botones *Ajustar*,
  *Rellenar* y *Rotar 90°*.
- **Opacidad** y **velocidad** (0,25×–4×): la velocidad conserva el tramo de fuente y cambia la
  duración; si chocaría con el clip siguiente, se acorta hasta él. El audio mantiene el tono.
- **Volumen** por clip (0–200 %), aplicado con Web Audio.
- **Transiciones básicas** en el corte entre dos clips pegados: fundido cruzado, fundido a negro,
  barrido y deslizar. No necesitan solapar clips: usan el último fotograma del clip saliente y el
  primero del entrante. Panel *Transiciones* y ajuste de tipo/duración en el inspector.
- **Keyframes** de posición, escala, rotación y opacidad: el rombo junto a cada propiedad añade o
  quita un keyframe en el cursor; editar una propiedad animada crea el keyframe automáticamente.
  Navegación entre keyframes y rombos sobre el clip en el timeline. Al dividir, recortar o cambiar
  la velocidad, la animación sigue al contenido.
- Los proyectos guardados con versiones anteriores se actualizan solos al abrirse.

## Fase 4: preview y reproducción

- **Motor de reproducción** (`features/preview/engine`) independiente de React, con reloj maestro
  propio. Cada clip con medio usa un `<video>`/`<audio>` que sigue al reloj; si se desvía más de
  150 ms se reposiciona.
- **Cambio entre clips sin saltos:** los clips que empiezan en los próximos 2 s se crean y se
  posicionan en su primer frame por adelantado. Los lejanos se liberan (máx. 8 elementos).
- **Seeking:** al hacer scrub en pausa, los videos muestran el fotograma exacto; si llega un
  destino nuevo durante un seek, solo se aplica el último (sin "tormentas" de seeks).
- **Buffering:** si un clip activo no tiene datos, el reloj se congela, se pausa todo y se muestra
  un indicador; se reanuda desde el mismo instante.
- **Audio** por Web Audio API (un `GainNode` por clip): las pistas silenciadas no suenan, también
  dentro de los videos. El `AudioContext` se reanuda al pulsar reproducir.
- **Control de FPS:** la preview se repinta solo cuando cambia el frame a los fps del proyecto.
  Calidad de preview ajustable (completa, media, baja) para equipos menos potentes.
- Imágenes y texto con su transformación; si un video no se puede reproducir en el navegador se
  muestra su miniatura con un aviso.

## Fase 3: timeline multipista

- **Mover clips** arrastrando, también entre pistas compatibles (video ↔ video, imágenes en video o
  superposición, texto en superposición, audio en audio). Con varios seleccionados se mueven juntos.
- **Sin solapes:** con un clip, si el destino está ocupado se coloca en el hueco libre más cercano;
  con varios, un destino no válido mantiene la última posición válida.
- **Recortar** arrastrando los bordes. Recortar el inicio de un video/audio desplaza su punto de
  entrada en la fuente; nunca se puede extender más allá del material del archivo.
- **Imán** (*snapping*) al inicio del proyecto, al playhead y a los bordes de otros clips, con guía
  visual. Botón o tecla **N**; mantener **Alt** lo ignora durante un arrastre.
- **Selección por rectángulo** arrastrando sobre zonas vacías (⇧ para añadir), ⌘/Ctrl+A para todo.
- **Pistas:** añadir (video, superposición, audio), eliminar (con sus clips) y reordenar arrastrando
  el asa o con teclado (espacio, flechas, espacio).
- Inicio y duración editables con valores exactos en el inspector (mismas reglas que al arrastrar).
- Zoom ajustado al proyecto (⇧Z), desplazamiento automático al arrastrar cerca de los bordes y
  **Esc** para cancelar un gesto. Cada gesto es un único paso de deshacer.

## Fase 2: importación y almacenamiento

- Importación de video (MP4, WebM, MOV, MKV), audio (MP3, WAV, OGG, M4A, AAC, FLAC) e imagen
  (PNG, JPG, WebP, GIF) con botón o arrastrando archivos a la biblioteca.
- Validación de tipo (MIME o extensión) y tamaño (video 4 GB, audio 500 MB, imagen 50 MB).
- Metadatos y miniaturas en un **Web Worker** con Mediabunny + WebCodecs (se carga solo al
  importar). Si el navegador no puede decodificar el archivo, respaldo con `<video>`/`<audio>`/`<img>`.
- Cola de importación secuencial con estado, errores descartables y cancelación.
- Persistencia en IndexedDB (Dexie): proyectos, metadatos de assets y binarios por separado.
  Autoguardado 500 ms después de cada cambio y al ocultar la pestaña.
- Comprobación de cuota antes de importar, mensajes claros si no hay espacio, solicitud de
  almacenamiento persistente (`navigator.storage.persist()`) e indicador de uso en `/projects`.
- Añadir al timeline con **+**, doble clic o arrastrando el medio a una pista; sin solapar clips.
- Miniaturas en la biblioteca y en los clips del timeline.
- Eliminar medios (bloqueado si un clip los usa) y proyectos (borra también sus medios).

## Sprint 1: interfaz del editor

- Landing (`/`), lista y creación de proyectos (`/projects`) y editor (`/editor/[projectId]`).
- Layout oscuro de escritorio: header, barra de herramientas, biblioteca, preview, timeline e inspector.
- Proyecto vacío 1920 × 1080 a 30 fps, o proyecto de demostración con clips de prueba (sin medios).
- Timeline en Canvas 2D: regla, playhead (clic y arrastre en la regla), zoom (botones o ⌘/Ctrl + rueda),
  scroll horizontal (rueda horizontal o ⇧ + rueda), selección de pistas y clips (⇧/⌘ para múltiple).
- Preview en Canvas: aplica posición, escala, rotación y opacidad. Los clips de video e imagen se
  dibujan como **marcadores de posición** (no hay decodificación todavía); el texto se renderiza real.
- Inspector de proyecto, pista y clip. Toda edición pasa por el sistema de comandos con deshacer/rehacer.
- Pistas: visibilidad, silencio y bloqueo (los clips de pistas bloqueadas no se pueden editar).
- Panel de texto para añadir títulos en la posición del playhead.
- Atajos: Espacio (reproducir), ⌘/Ctrl+Z, ⇧⌘/Ctrl+Z, Supr, Esc, ←/→ (frame), ⇧←/→ (1 s).

## Arquitectura

```text
src/
├── app/                 Rutas (Next.js App Router)
├── components/          ui/ (shadcn/ui + Base UI) y shared/
├── core/                Modelo, comandos, timeline. Sin React ni Next.js.
│   ├── types/time.ts        Tiempo en microsegundos enteros
│   ├── project/             Esquemas Zod, fábricas y consultas
│   ├── commands/            Comandos puros + historial undo/redo
│   ├── timeline/            Geometría, reglas de edición (mover/recortar) y snapping
│   ├── media/               Validación de archivos y colocación de clips
│   ├── playback/            Planificación de la reproducción y composición con transiciones
│   ├── animation/           Keyframes: interpolación, edición, división
│   ├── export/              Ajustes de exportación y análisis previo (plan)
│   ├── audio/               Mezcla de audio por bloques (remuestreo, volumen, velocidad)
│   └── ports/               Contratos: ProjectRepository, AssetStorage, MediaAssetRepository
├── infrastructure/      Implementaciones locales (Dexie/IndexedDB, cuota de almacenamiento)
├── workers/             media.worker.ts y export.worker.ts (Mediabunny + WebCodecs, vía Comlink)
├── features/
│   ├── editor/              Layout, paneles, inspector, store (Zustand), atajos
│   ├── timeline/            Renderizador Canvas + componentes
│   ├── preview/             Motor de reproducción, renderizador Canvas y caché de imágenes
│   ├── render/              Compositor compartido por preview y exportación
│   ├── export/              Diálogo, servicio, store y motor de exportación (worker)
│   ├── media/               Importación, biblioteca, store de assets
│   ├── projects/            Lista de proyectos y persistencia (autoguardado)
│   ├── text/                Panel de textos
│   └── transitions/         Panel de transiciones
└── lib/                 Canvas, hooks, caché LRU, detección de compatibilidad, constantes
tests/
├── unit/                Vitest (core + store)
└── e2e/                 Playwright (criterios de aceptación)
```

Reglas clave: `core/` no importa React; Zustand solo guarda metadatos (nunca `File`/`Blob`); los
binarios viven en IndexedDB y los `ImageBitmap`/object URLs se liberan al dejar de usarse; las
ediciones pasan por comandos; los renderizadores de canvas son funciones independientes de React.

## Limitaciones conocidas

- IndexedDB no es almacenamiento garantizado: si el navegador no concede almacenamiento
  persistente, puede borrar los datos bajo presión de espacio. Aún no hay exportación de backups.
- Si se deshace la eliminación de un clip cuyo medio ya se borró, el clip aparece como
  "Medio no disponible".
- Compatibilidad de códecs según navegador: H.264/AAC no está disponible en algunas builds de
  Chromium sin códecs propietarios; en ese caso se muestra un error claro al importar.
- Exportación:
  - Con velocidad distinta de 1× el audio exportado cambia de tono (en la preview se conserva):
    el remuestreo es lineal, sin corrección de tono.
  - Solo se usan los dos primeros canales de audio de cada fuente (sonido envolvente → estéreo).
  - El tamaño estimado es un máximo orientativo; con contenido sencillo el archivo es menor.
  - Si el codificador elegido no es H.264, algunos reproductores (p. ej. QuickTime) podrían no
    abrir el archivo.
  - Si OPFS no está disponible (p. ej. Safari en navegación privada), el archivo se genera en memoria.
  - Turbopack evalúa Mediabunny dos veces dentro de los workers (aviso "Mediabunny was loaded twice" en
    la consola); no afecta al resultado, que verifican las pruebas.
- Navegadores:
  - Verificados con pruebas automáticas: Chromium (equivale a Chrome y Edge) y WebKit (motor de Safari;
    no es Safari real). Firefox no se ha podido ejecutar en local (la build de Playwright no arranca en
    macOS 27); corre en CI sin bloquear hasta verificarlo.
  - En Safari en navegación privada, los medios importados se guardan como `ArrayBuffer`: ocupan memoria
    al importarlos, así que los archivos muy grandes pueden fallar.
  - La interfaz del editor necesita al menos 1024 px de ancho; no está adaptada a móviles.
- No hay modo sin conexión (service worker) ni copias de seguridad/exportación del proyecto.
