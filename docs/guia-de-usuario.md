# Guía de usuario de WebCut Studio

WebCut Studio es un editor de video que funciona en el navegador. Todo ocurre en tu equipo: los archivos
no se suben a ningún servidor y los proyectos se guardan en el almacenamiento local del navegador.

## 1. Requisitos

- Un ordenador de escritorio o portátil (la interfaz necesita al menos 1024 px de ancho).
- Un navegador reciente: **Chrome o Edge** (recomendado), **Safari 16.4+** o **Firefox 130+**.
  Ver [compatibilidad](#8-compatibilidad).
- Espacio libre en disco: los medios importados se copian al almacenamiento del navegador.

## 2. Proyectos

En **Proyectos** puedes:

- **Crear** un proyecto vacío (1920 × 1080, 30 fps) o uno de **demostración** con clips de ejemplo.
- **Abrir** un proyecto reciente.
- **Eliminar** un proyecto y todos sus medios (no se puede deshacer).
- Ver cuánto **almacenamiento** usa el sitio.

Los cambios se **guardan solos** mientras editas (indicador junto al nombre del proyecto).

> Si borras los datos del sitio en el navegador, se borran también tus proyectos. Al importar el primer
> medio, WebCut pide al navegador almacenamiento persistente para reducir ese riesgo.

## 3. Importar medios

Panel **Medios** → **Importar medios**, o arrastra archivos al panel.

| Tipo | Formatos habituales | Tamaño máximo |
|---|---|---|
| Video | MP4/M4V, WebM, MOV, MKV | 4 GB |
| Audio | MP3, WAV, AAC/M4A, OGG/Opus, FLAC | 500 MB |
| Imagen | PNG, JPG, WebP, GIF | 50 MB |

Que un archivo se pueda leer depende también de los códecs que admita tu navegador.

Para añadir un medio al timeline, arrástralo o pulsa **+** en su tarjeta. Un medio que está en uso no se
puede borrar de la biblioteca.

## 4. Timeline

Pistas de arriba abajo: **Texto**, **Video 2**, **Video 1** y **Audio**. Lo que está más arriba se ve
encima.

- **Mover**: arrastra un clip (también a otra pista compatible). Con el **imán** activado (N), se ajusta a
  los bordes de otros clips y al cursor; mantén **Alt** para ignorarlo.
- **Recortar**: arrastra los bordes del clip.
- **Seleccionar varios**: arrastra un rectángulo en una zona vacía, o ⇧/⌘ + clic.
- **Zoom**: ⌘/Ctrl + rueda, o los botones de la barra. **⇧Z** ajusta todo el proyecto a la vista.
- **Pistas**: añade pistas con **+ Pista**; reordénalas arrastrando el asa; oculta, silencia o bloquea
  cada una desde su cabecera.

## 5. Edición

| Acción | Atajo |
|---|---|
| Reproducir / pausar | Espacio |
| Dividir en el cursor | ⌘/Ctrl + B |
| Eliminar a la izquierda / derecha del cursor | Q / W |
| Eliminar selección | Supr / Retroceso |
| Deshacer / rehacer | ⌘/Ctrl + Z · ⇧⌘/Ctrl + Z |
| Seleccionar todo | ⌘/Ctrl + A |
| Frame anterior / siguiente | ← / → (con ⇧: 1 segundo) |
| Quitar la selección | Esc |

En el **inspector** (panel derecho), con un clip seleccionado:

- **Transformación**: posición, escala, rotación y opacidad. También puedes mover, escalar (esquinas) y
  rotar (asa superior) directamente en la preview.
- **Keyframes**: el rombo junto a cada propiedad añade o quita un keyframe en el cursor. Si la propiedad ya
  está animada, cambiar su valor crea el keyframe automáticamente.
- **Recorte (crop)** por los cuatro lados.
- **Velocidad** (0,25× – 4×) y **volumen** (0 – 200 %).
- **Transición de entrada** (fundido cruzado, fundido a negro, barrido, deslizar) cuando el clip está pegado
  al anterior. También desde el panel **Transiciones**.

Textos: panel **Texto** → elige un estilo; edita el contenido, el tamaño y el color en el inspector.

## 6. Exportar

Botón **Exportar** (arriba a la derecha):

1. Elige **resolución** (la del proyecto, 4K, 1080p, 720p o 480p), **fotogramas por segundo** y
   **calidad**.
2. Revisa los avisos (clips sin medio, códecs disponibles).
3. Pulsa **Exportar MP4**. Puedes ver el progreso y **cancelar**. No cierres la pestaña mientras exporta.
4. Al terminar, revisa el resultado y pulsa **Descargar**.

Si algo falla, el mensaje explica la causa (por ejemplo, un medio que falta, con un botón para ir al clip) y
puedes reintentar con otros ajustes.

## 7. Consejos

- Si la reproducción va lenta, baja la **calidad de la vista previa** (debajo de la preview). No afecta a la
  exportación.
- Para exportaciones largas, cierra otras pestañas pesadas.
- Haz copias de los archivos originales: WebCut trabaja con una copia guardada en el navegador.

## 8. Compatibilidad

| Navegador | Edición | Exportación MP4 | Notas |
|---|:---:|:---:|---|
| Chrome / Edge | ✓ | ✓ | Recomendado. H.264 + AAC. |
| Safari 16.4+ | ✓ | ✓ | En navegación privada los archivos se guardan en memoria. |
| Firefox 130+ | ✓ | Parcial | Audio en Opus dentro del MP4. Sin verificar todavía con pruebas automáticas. |

En móviles y tabletas la interfaz no está adaptada.
