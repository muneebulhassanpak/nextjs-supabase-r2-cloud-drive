import { AuthApiError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { authErrorMessage } from "@/server/auth/errors";
import { logger } from "@/server/logger";

const authError = (code: string) => new AuthApiError("raw developer message", 400, code);

describe("authErrorMessage", () => {
  it.each([
    ["invalid_credentials", "Wrong email or password."],
    ["email_not_confirmed", "Confirm your email address first."],
    ["weak_password", "Choose a stronger password"],
    ["same_password", "different from your current one"],
    ["over_request_rate_limit", "Too many attempts."],
    ["over_email_send_rate_limit", "Too many attempts."],
    ["session_not_found", "Your session has expired."],
    ["session_expired", "Your session has expired."],
    ["refresh_token_not_found", "Your session has expired."],
    ["user_banned", "This account is suspended."],
  ])("explains %s", (code, message) => {
    expect(authErrorMessage(authError(code))).toContain(message);
  });

  it("never shows Supabase's own wording, and logs what it didn't expect", () => {
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const message = authErrorMessage(authError("unexpected_failure"), "req-9");
    expect(message).toBe("Something went wrong. Try again in a moment.");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ code: "unexpected_failure", requestId: "req-9" }),
      "unexpected auth error",
    );
    log.mockRestore();
  });
});
