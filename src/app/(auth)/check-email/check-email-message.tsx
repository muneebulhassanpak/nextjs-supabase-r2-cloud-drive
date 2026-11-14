"use client";

import { useSearchParams } from "next/navigation";

/** The sign-up and reset forms both end here; `?for=reset` picks the wording. */
export function CheckEmailMessage() {
  const forReset = useSearchParams().get("for") === "reset";
  return forReset ? (
    <p>
      If an account uses that address, we&apos;ve sent it a link to choose a new password. The link
      works for 1 hour.
    </p>
  ) : (
    <p>
      We&apos;ve sent you a link to confirm your email address. Open it to finish creating your
      account. The link works for 1 hour.
    </p>
  );
}
