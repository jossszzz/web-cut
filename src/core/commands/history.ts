import type { Project } from "../project/schema";
import type { Command } from "./types";

export const MAX_HISTORY = 200;

export interface History {
  readonly past: readonly Command[];
  readonly future: readonly Command[];
  /** Clave del último comando mientras siga abierto a fusiones. */
  readonly openMergeKey: string | null;
}

export interface HistoryResult {
  project: Project;
  history: History;
}

export function createHistory(): History {
  return { past: [], future: [], openMergeKey: null };
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;

function mergeCommands(older: Command, newer: Command): Command {
  return {
    label: newer.label,
    mergeKey: newer.mergeKey,
    execute: newer.execute,
    undo: older.undo,
  };
}

export function executeCommand(
  project: Project,
  history: History,
  command: Command,
): HistoryResult {
  const next = command.execute(project);
  const last = history.past.at(-1);
  const shouldMerge =
    last !== undefined &&
    command.mergeKey !== undefined &&
    command.mergeKey === history.openMergeKey;

  const past = shouldMerge
    ? [...history.past.slice(0, -1), mergeCommands(last, command)]
    : [...history.past, command].slice(-MAX_HISTORY);

  return {
    project: next,
    history: { past, future: [], openMergeKey: command.mergeKey ?? null },
  };
}

export function undo(project: Project, history: History): HistoryResult {
  const command = history.past.at(-1);
  if (!command) return { project, history };
  return {
    project: command.undo(project),
    history: {
      past: history.past.slice(0, -1),
      future: [command, ...history.future],
      openMergeKey: null,
    },
  };
}

export function redo(project: Project, history: History): HistoryResult {
  const [command, ...future] = history.future;
  if (!command) return { project, history };
  return {
    project: command.execute(project),
    history: { past: [...history.past, command], future, openMergeKey: null },
  };
}

/** Cierra la fusión en curso: el siguiente comando creará un paso nuevo. */
export function sealHistory(history: History): History {
  return history.openMergeKey === null ? history : { ...history, openMergeKey: null };
}
