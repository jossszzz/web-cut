# WebCut Studio

Editor de video web, **local-first** y **browser-based**. La especificación completa está en
[`docs/arquitectura-roadmap.md`](docs/arquitectura-roadmap.md).

> Estado: **Fase 3** completada (timeline multipista). Todavía no hay reproducción real de video
> (Fase 4) ni exportación (Fase 6).

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
pnpm test:e2e         # pruebas E2E (Playwright, compila y arranca la app)
```

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
- Miniaturas en la biblioteca y en los clips del timeline. La preview dibuja imágenes reales y,
  para video, la miniatura como fotograma de referencia hasta la Fase 4.
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
│   └── ports/               Contratos: ProjectRepository, AssetStorage, MediaAssetRepository
├── infrastructure/      Implementaciones locales (Dexie/IndexedDB, cuota de almacenamiento)
├── workers/             media.worker.ts (Mediabunny + WebCodecs, vía Comlink)
├── features/
│   ├── editor/              Layout, paneles, inspector, store (Zustand), atajos
│   ├── timeline/            Renderizador Canvas + componentes
│   ├── preview/             Renderizador Canvas + reloj de reproducción
│   ├── media/               Importación, biblioteca, store de assets
│   ├── projects/            Lista de proyectos y persistencia (autoguardado)
│   ├── text/
└── lib/                 Utilidades de canvas, hooks, constantes
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
