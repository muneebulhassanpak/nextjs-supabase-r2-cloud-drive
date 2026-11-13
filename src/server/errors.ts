import "server-only";

import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";

/**
 * One error format for every error response:
 *   { "error": { "code": "not_found", "message": "...", "requestId": "...", "details": ... } }
 */
export interface ErrorBody {
  code: string;
  message: string;
  requestId?: string | undefined;
  details?: unknown;
}

/** Base class for errors raised on purpose by the application. */
export class AppError extends Error {
  readonly status: number = 400;
  readonly code: string = "bad_request";

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  override readonly status = 422;
  override readonly code = "validation_error";
}

export class UnauthorizedError extends AppError {
  override readonly status = 401;
  override readonly code = "unauthorized";
}

export class ForbiddenError extends AppError {
  override readonly status = 403;
  override readonly code = "forbidden";
}

export class NotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = "not_found";
}

export class ConflictError extends AppError {
  override readonly status = 409;
  override readonly code = "conflict";
}

/** Storage quota or file size limit reached. */
export class QuotaExceededError extends AppError {
  override readonly status = 413;
  override readonly code = "quota_exceeded";
}

/**
 * The Postgres error code (SQLSTATE) of a database error. supabase-js returns it as `code` on the
 * error object; other clients may wrap it in `cause`, so both are checked.
 */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

/**
 * Database refusals that mean "you can't do that" rather than "something broke": row-level
 * security blocking a write, and unique or foreign key violations.
 */
function fromDatabaseError(error: unknown, requestId?: string): AppError | undefined {
  switch (pgErrorCode(error)) {
    case "42501":
      // Usually row-level security refusing a write, but a missing GRANT looks the same.
      // Log it, so a deploy-wide misconfiguration doesn't hide behind "no access".
      logger.warn({ err: error, requestId }, "database refused the request (42501)");
      return new ForbiddenError("You don't have access to do that.");
    case "23505":
      return new ConflictError("That already exists.");
    case "23503":
      return new ConflictError(
        "Something this depends on was changed or removed. Refresh and try again.",
      );
    default:
      return undefined;
  }
}

/** Turns any thrown value into the standard error body. Unexpected errors never leak details. */
export function toErrorBody(
  thrown: unknown,
  requestId?: string,
): { status: number; body: ErrorBody } {
  const error = fromDatabaseError(thrown, requestId) ?? thrown;
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { code: error.code, message: error.message, requestId, details: error.details },
    };
  }
  logger.error({ err: error, requestId }, "unhandled error");
  return {
    status: 500,
    body: { code: "internal_error", message: "Something went wrong.", requestId },
  };
}

/** Route Handler wrapper: `export const GET = withErrorHandling(async (req) => ...)`. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const { status, body } = toErrorBody(error, await getRequestId());
      return Response.json({ error: body }, { status });
    }
  };
}

/** What every Server Action returns, so forms can show errors without try/catch. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorBody & { fieldErrors?: Record<string, string[]> } };
