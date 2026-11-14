import { describe, expect, it } from "vitest";

import {
  anonClient,
  confirmLink,
  latestEmail,
  newUser,
  testEmail,
  testPassword,
} from "../support/local-stack";

// The auth rules as configured in supabase/config.toml, checked against the local Auth server and
// Mailpit: what the app relies on even when someone skips the app and calls Auth directly.

async function signUp(email: string, password = testPassword()) {
  const result = await anonClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: "Ada Lovelace" } },
  });
  return { ...result, password };
}

describe("sign-up and email confirmation", () => {
  it("sends a Lockerly email whose link confirms the account, once", async () => {
    const email = testEmail("signup");
    const { data, error, password } = await signUp(email);
    expect(error).toBeNull();
    expect(data.session).toBeNull();

    const blocked = await anonClient().auth.signInWithPassword({ email, password });
    expect(blocked.error?.code).toBe("email_not_confirmed");

    const message = await latestEmail(email);
    expect(message.subject).toBe("Confirm your Lockerly account");
    const link = confirmLink(message.html);
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("type")).toBe("email");
    expect(link.searchParams.get("next")).toBe("/drive");

    const client = anonClient();
    const tokenHash = link.searchParams.get("token_hash") ?? "";
    const verified = await client.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();

    const reused = await anonClient().auth.verifyOtp({ type: "email", token_hash: tokenHash });
    expect(reused.error).not.toBeNull();

    const { data: profile } = await client.from("profiles").select("full_name").single();
    expect(profile?.full_name).toBe("Ada Lovelace");
    expect((await anonClient().auth.signInWithPassword({ email, password })).error).toBeNull();
  });

  it("answers the same for an email that already has an account", async () => {
    const { email } = await newUser("taken");
    const again = await signUp(email);
    const fresh = await signUp(testEmail("fresh"));
    expect(again.error).toBeNull();
    expect(fresh.error).toBeNull();
    expect(again.data.session).toBeNull();
    expect(fresh.data.session).toBeNull();
  });

  it.each(["short1", "onlyletters", "1234567890"])(
    "refuses the weak password %j even without the app",
    async (password) => {
      const { error } = await signUp(testEmail("weak"), password);
      expect(error?.code).toBe("weak_password");
    },
  );
});

describe("password reset", () => {
  it("emails a reset link that lets the person choose a new password", async () => {
    const { email } = await newUser("reset");
    const { error } = await anonClient().auth.resetPasswordForEmail(email);
    expect(error).toBeNull();

    const message = await latestEmail(email);
    expect(message.subject).toBe("Reset your Lockerly password");
    const link = confirmLink(message.html);
    expect(link.searchParams.get("type")).toBe("recovery");
    expect(link.searchParams.get("next")).toBe("/reset-password");

    const client = anonClient();
    const verified = await client.auth.verifyOtp({
      type: "recovery",
      token_hash: link.searchParams.get("token_hash") ?? "",
    });
    expect(verified.error).toBeNull();

    const password = testPassword();
    expect((await client.auth.updateUser({ password })).error).toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email, password })).error).toBeNull();

    const notice = await latestEmail(email);
    expect(notice.subject).toBe("Your Lockerly password was changed");
  });

  it("doesn't say whether an email has an account", async () => {
    const { error } = await anonClient().auth.resetPasswordForEmail(testEmail("nobody"));
    expect(error).toBeNull();
  });
});

describe("signing out everywhere", () => {
  it("ends the sessions on other devices", async () => {
    const email = testEmail("devices");
    const password = testPassword();
    const first = await signUp(email, password);
    expect(first.error).toBeNull();
    const link = confirmLink((await latestEmail(email)).html);
    const laptop = anonClient();
    await laptop.auth.verifyOtp({
      type: "email",
      token_hash: link.searchParams.get("token_hash") ?? "",
    });
    const phone = anonClient();
    expect((await phone.auth.signInWithPassword({ email, password })).error).toBeNull();

    expect((await laptop.auth.signOut({ scope: "global" })).error).toBeNull();

    const refreshed = await phone.auth.refreshSession();
    expect(refreshed.error).not.toBeNull();
  });
});
