import type { Project } from "../project/schema";

/**
 * Operación de edición reversible. Los comandos son puros: reciben un
 * proyecto inmutable y devuelven uno nuevo.
 */
export interface Command {
  readonly label: string;
  /**
   * Comandos consecutivos con la misma clave se fusionan en un solo paso de
   * historial (p. ej. arrastrar un slider de opacidad).
   */
  readonly mergeKey?: string;
  execute(project: Project): Project;
  undo(project: Project): Project;
}
