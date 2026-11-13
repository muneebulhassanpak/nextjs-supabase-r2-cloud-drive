import { afterEach, expect, vi } from "vitest";

// An unexpected console.error usually means a hidden bug (React warnings, unhandled errors).
const consoleError = vi.spyOn(console, "error");

afterEach(() => {
  expect(consoleError, "console.error was called").not.toHaveBeenCalled();
  consoleError.mockClear();
});
