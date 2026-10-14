import { AppError, type ErrorCode } from "@loyalty/shared/errors";
import { supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";

export interface ClassifiedError {
  error: AppError;
  /** true = errore imprevisto (bug, database): va loggato con lo stack come http.request.failed. */
  unexpected: boolean;
}

/** Errori di supabase-js (PostgrestError e simili): oggetti semplici con code/message/details. */
function isDbError(e: unknown): e is { message: string; code?: string; details?: string; hint?: string } {
  return (
    e !== null &&
    typeof e === "object" &&
    !(e instanceof Error && e.name !== "PostgrestError") &&
    "message" in e &&
    ("details" in e || "hint" in e)
  );
}

/** Riconduce qualsiasi eccezione a un errore del catalogo. */
export function classifyError(e: unknown): ClassifiedError {
  if (e instanceof AppError) return { error: e, unexpected: false };
  if (isDbError(e)) {
    const detail = [e.code, e.message, e.details].filter(Boolean).join(" · ");
    return {
      error: new AppError("E_DB", `errore del database: ${detail}`, { db_code: e.code }, { cause: e }),
      unexpected: true,
    };
  }
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return { error: new AppError("E_INTERNAL", message, {}, { cause: e }), unexpected: true };
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; support_code: string };
}

export function errorResponse(error: AppError, requestId: string): Response {
  const body: ErrorBody = {
    error: { code: error.code, message: error.userMessage, support_code: supportCodeFromRequestId(requestId) },
  };
  return Response.json(body, { status: error.status });
}
