import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppError,
  ConflictError,
  ForbiddenError,
  formError,
  NotFoundError,
  pgErrorCode,
  QuotaExceededError,
  toErrorBody,
  UnauthorizedError,
  ValidationError,
  withErrorHandling,
} from "@/server/errors";

const headers = new Headers();
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(headers) }));

describe("toErrorBody", () => {
  it.each([
    [new ValidationError("bad input"), 422, "validation_error"],
    [new UnauthorizedError("sign in"), 401, "unauthorized"],
    [new ForbiddenError("no access"), 403, "forbidden"],
    [new NotFoundError("missing"), 404, "not_found"],
    [new ConflictError("taken"), 409, "conflict"],
    [new QuotaExceededError("full"), 413, "quota_exceeded"],
    [new AppError("generic"), 400, "bad_request"],
  ])("maps %o to its status and code", (error, status, code) => {
    const result = toErrorBody(error, "req-1");

    expect(result.status).toBe(status);
    expect(result.body).toEqual({
      code,
      message: error.message,
      requestId: "req-1",
      details: undefined,
    });
  });

  it("keeps details from application errors", () => {
    const details = { field: "email" };

    expect(toErrorBody(new ValidationError("bad input", details)).body.details).toBe(details);
  });

  it("hides the message of unexpected errors", () => {
    const result = toErrorBody(new Error("connection string with secrets"), "req-2");

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      code: "internal_error",
      message: "Something went wrong.",
      requestId: "req-2",
    });
  });

  it("names errors after their class", () => {
    expect(new NotFoundError("missing").name).toBe("NotFoundError");
  });
});

describe("withErrorHandling", () => {
  beforeEach(() => {
    headers.set("x-request-id", "req-42");
  });

  it("passes successful responses through", async () => {
    const handler = withErrorHandling(() => Promise.resolve(Response.json({ ok: true })));

    const response = await handler();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("turns thrown errors into the standard error response", async () => {
    const handler = withErrorHandling(() => Promise.reject(new NotFoundError("File not found")));

    const response = await handler();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "File not found", requestId: "req-42" },
    });
  });
});

describe("database errors", () => {
  /** How supabase-js surfaces a Postgres error: a plain object with the SQLSTATE in `code`. */
  function dbError(code: string, message = "denied") {
    return { code, message, details: null, hint: null };
  }

  it.each([
    ["42501", 403, "forbidden"],
    ["P0002", 404, "not_found"],
    ["23505", 409, "conflict"],
    ["23503", 409, "conflict"],
    ["LK409", 409, "conflict"],
    ["LK413", 413, "quota_exceeded"],
    ["LK422", 422, "validation_error"],
    ["22023", 422, "validation_error"],
    ["23514", 422, "validation_error"],
    ["22P02", 422, "validation_error"],
  ])("maps SQLSTATE %s to %s", (sqlState, status, code) => {
    expect(toErrorBody(dbError(sqlState))).toMatchObject({ status, body: { code } });
  });

  it("shows the database's own message only for errors our SQL raises on purpose", () => {
    const quota = toErrorBody(dbError("LK413", "Files can be at most 25 MB"));
    expect(quota.body.message).toBe("Files can be at most 25 MB");

    const constraint = toErrorBody(
      dbError("23514", 'new row for relation "items" violates check constraint "items_name_valid"'),
    );
    expect(constraint.body.message).toBe("That isn't valid.");

    // Postgres raises 22023 itself too, so only our own LK422 shows its message.
    const ours = toErrorBody(dbError("LK422", "Items can only go inside a folder"));
    expect(ours.body.message).toBe("Items can only go inside a folder");
    const internal = toErrorBody(dbError("22023", "unrecognized configuration parameter"));
    expect(internal.body.message).toBe("That isn't valid.");

    const notFound = toErrorBody(dbError("P0002", "Item not found"));
    expect(notFound.body.message).not.toContain("Item not found");
  });

  it("falls back to a generic message when the database sent none", () => {
    expect(toErrorBody(dbError("LK409", "")).body.message).toBe("That can't be done right now.");
    expect(toErrorBody({ code: "LK413" }).body.message).toBe("Not enough storage space left.");
  });

  it("treats other database errors as unexpected", () => {
    expect(toErrorBody(dbError("57014")).status).toBe(500);
  });

  it("reads the code from the error or its cause, ignoring non-SQLSTATE codes", () => {
    expect(pgErrorCode(Object.assign(new Error(), { code: "23505" }))).toBe("23505");
    expect(pgErrorCode(dbError("42501"))).toBe("42501");
    expect(pgErrorCode(new Error("wrapped", { cause: dbError("23503") }))).toBe("23503");
    expect(pgErrorCode(Object.assign(new Error(), { code: "ECONNREFUSED" }))).toBeUndefined();
    expect(pgErrorCode("nope")).toBeUndefined();
  });
});

describe("formError", () => {
  it("wraps a message for the form", () => {
    expect(formError("Nope.", { email: "a@b.dev" }, "req-2")).toEqual({
      ok: false,
      error: { code: "bad_request", message: "Nope.", requestId: "req-2" },
      values: { email: "a@b.dev" },
    });
  });

  it("wraps field errors, without values when none are given", () => {
    const result = formError({ fieldErrors: { email: ["Enter a valid email address."] } });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Check the highlighted fields.",
        requestId: undefined,
        fieldErrors: { email: ["Enter a valid email address."] },
      },
    });
  });
});
