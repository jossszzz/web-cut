"use client";

import { useId, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function InspectorSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Campo de texto que confirma al perder el foco o pulsar Enter.
 * Mientras se edita guarda un borrador local; Esc lo descarta.
 */
export function TextField({
  label,
  value,
  onCommit,
  multiline = false,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const common = {
    id,
    value: draft ?? value,
    onFocus: () => setDraft(value),
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: commit,
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
          className="w-full resize-none rounded-lg border border-input bg-input/30 px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <Input
          {...common}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(null);
              // Restaurar antes de perder el foco para no confirmar el borrador.
              requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
            }
          }}
        />
      )}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix,
  precision = 0,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  precision?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const formatted = Number(value.toFixed(precision)).toString();

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(",", "."));
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft ?? formatted}
          onFocus={() => setDraft(formatted)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const delta = (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1);
              const base = Number((draft ?? formatted).replace(",", "."));
              setDraft(String(Number(((Number.isFinite(base) ? base : value) + delta).toFixed(precision))));
            }
          }}
          className="pr-8 font-mono text-xs tabular-nums"
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Slider con cambios en vivo. `onChange` se llama durante el arrastre (los
 * comandos se fusionan por `mergeKey`) y `onCommit` al soltar, para sellar el
 * historial en un único paso de deshacer.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  const id = useId();
  const pick = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : v) as number;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label id={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <span className="font-mono text-xs tabular-nums">{format(value)}</span>
      </div>
      <Slider
        aria-labelledby={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(pick(v))}
        onValueCommitted={() => onCommit()}
      />
    </div>
  );
}
