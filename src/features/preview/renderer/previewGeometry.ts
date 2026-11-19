/**
 * Geometría de las cajas de los clips en la preview (en píxeles CSS del
 * canvas), para dibujar los controles de selección y detectar clics.
 */

export interface PreviewBox {
  clipId: string;
  /** Transformación del espacio local del clip (centrado en 0,0) a píxeles CSS del canvas. */
  matrix: DOMMatrix;
  /** Tamaño local de la caja (incluye margen en textos). */
  width: number;
  height: number;
  /** El clip se puede manipular (pista no bloqueada). */
  editable: boolean;
}

export type PreviewHandle = "body" | "corner" | "rotate";

export const HANDLE_SIZE = 9;
export const ROTATE_HANDLE_OFFSET = 26;
const HIT_SLOP = 6;

export interface Point {
  x: number;
  y: number;
}

export function boxCorners(box: PreviewBox): Point[] {
  const w = box.width / 2;
  const h = box.height / 2;
  return [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ].map(([x, y]) => {
    const p = box.matrix.transformPoint({ x, y });
    return { x: p.x, y: p.y };
  });
}

export function boxCenter(box: PreviewBox): Point {
  const p = box.matrix.transformPoint({ x: 0, y: 0 });
  return { x: p.x, y: p.y };
}

/** Posición del asa de rotación: por encima del centro del borde superior. */
export function rotateHandlePosition(box: PreviewBox): Point {
  const [tl, tr] = boxCorners(box);
  const mid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  const center = boxCenter(box);
  const dx = mid.x - center.x;
  const dy = mid.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: mid.x + (dx / length) * ROTATE_HANDLE_OFFSET, y: mid.y + (dy / length) * ROTATE_HANDLE_OFFSET };
}

function insideBox(box: PreviewBox, point: Point): boolean {
  if (!box.matrix.is2D) return false;
  const local = box.matrix.inverse().transformPoint(point);
  return Math.abs(local.x) <= box.width / 2 && Math.abs(local.y) <= box.height / 2;
}

/**
 * Busca qué hay bajo el puntero. Los controles del clip seleccionado tienen
 * prioridad; después, el clip visible más alto.
 */
export function hitTestPreview(
  boxes: readonly PreviewBox[],
  point: Point,
  selectedIds: ReadonlySet<string>,
): { clipId: string; handle: PreviewHandle } | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (!selectedIds.has(box.clipId) || !box.editable) continue;
    const rotate = rotateHandlePosition(box);
    if (Math.hypot(point.x - rotate.x, point.y - rotate.y) <= HANDLE_SIZE + HIT_SLOP / 2) {
      return { clipId: box.clipId, handle: "rotate" };
    }
    if (boxCorners(box).some((c) => Math.hypot(point.x - c.x, point.y - c.y) <= HANDLE_SIZE + HIT_SLOP / 2)) {
      return { clipId: box.clipId, handle: "corner" };
    }
  }
  for (let i = boxes.length - 1; i >= 0; i--) {
    if (insideBox(boxes[i], point)) return { clipId: boxes[i].clipId, handle: "body" };
  }
  return null;
}
