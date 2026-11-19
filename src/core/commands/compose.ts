import type { Command } from "./types";

/** Agrupa varios comandos en un único paso de historial. `null` si no hay ninguno. */
export function composeCommands(label: string, commands: ReadonlyArray<Command | null>): Command | null {
  const list = commands.filter((c): c is Command => c !== null);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return {
    label,
    execute: (project) => list.reduce((p, c) => c.execute(p), project),
    undo: (project) => list.reduceRight((p, c) => c.undo(p), project),
  };
}
