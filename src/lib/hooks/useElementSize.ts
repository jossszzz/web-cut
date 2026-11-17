"use client";

import { useCallback, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/** Mide un elemento con ResizeObserver. Devuelve un ref callback y su tamaño. */
export function useElementSize<T extends HTMLElement>(): [(node: T | null) => void, ElementSize] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return [ref, size];
}
