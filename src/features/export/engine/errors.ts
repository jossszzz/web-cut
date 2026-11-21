import type { ExportErrorCode, ExportFailure } from "../types";

/** Error con código para mostrar un mensaje útil y decidir si se puede reintentar. */
export class ExportFailureError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message: string,
    readonly clipId?: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExportFailureError";
  }
}

const describe = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.name === "NoModificationAllowedError";
  }
  return error instanceof Error && /quota/i.test(error.message);
}

/** Convierte cualquier error en un fallo serializable con mensaje en español. */
export function toExportFailure(error: unknown, stage: "prepare" | "encode"): ExportFailure {
  if (error instanceof ExportFailureError) {
    return { code: error.code, message: error.message, clipId: error.clipId, detail: error.cause ? describe(error.cause) : undefined };
  }
  if (isQuotaError(error)) {
    return {
      code: "storage",
      message: "No queda espacio en el dispositivo para el archivo exportado. Libera espacio o exporta con menos calidad o resolución.",
      detail: describe(error),
    };
  }
  if (stage === "encode") {
    return {
      code: "encoder",
      message: "El codificador de video falló. Prueba con otra resolución o calidad; si persiste, cierra otras pestañas y reintenta.",
      detail: describe(error),
    };
  }
  return { code: "unknown", message: "Error inesperado al exportar.", detail: describe(error) };
}
