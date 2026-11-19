"use client";

import { Diamond } from "lucide-react";
import { cn } from "cn";

/**
 * Rombo de keyframe junto a una propiedad:
 * vacío = sin animar · contorno resaltado = animada, sin keyframe aquí ·
 * relleno = hay keyframe en el playhead.
 */
export function KeyframeButton({
  property,
  animated,
  atPlayhead,
  disabled,
  onToggle,
}: {
  property: string;
  animated: boolean;
  atPlayhead: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const label = atPlayhead ? `Quitar keyframe de ${property}` : `Añadir keyframe de ${property}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={label}
      aria-pressed={atPlayhead}
      title={disabled ? "Coloca el cursor dentro del clip para usar keyframes" : label}
      className={cn(
        "grid size-5 place-items-center rounded text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
        animated && "text-amber-300",
      )}
    >
      <Diamond className={cn("size-3", atPlayhead && "fill-current")} />
    </button>
  );
}
