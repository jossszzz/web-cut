"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconButtonProps extends Omit<ComponentProps<typeof Button>, "children" | "aria-label"> {
  label: string;
  /** Texto adicional del tooltip, p. ej. un atajo o el motivo de estar deshabilitado. */
  hint?: string;
  children: ReactNode;
}

/** Botón de icono con etiqueta accesible y tooltip. */
export function IconButton({
  label,
  hint,
  children,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        // Envolver en span permite mostrar el tooltip aunque el botón esté deshabilitado.
        render={<span className="inline-flex" />}
      >
        <Button aria-label={label} variant={variant} size={size} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {hint && <span className="text-background/60">· {hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
