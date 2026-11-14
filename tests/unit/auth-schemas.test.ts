import { describe, expect, it } from "vitest";

import { newPasswordSchema, signInSchema, signUpSchema } from "@/lib/auth/schemas";

const valid = { fullName: "Ada Lovelace", email: "Ada@Example.com ", password: "engine1843" };

describe("signUpSchema", () => {
  it("accepts a valid sign-up and normalises the email", () => {
    expect(signUpSchema.parse(valid)).toEqual({ ...valid, email: "ada@example.com" });
  });

  it.each([
    ["short1", "Use at least 8 characters."],
    ["onlyletters", "Use both letters and numbers."],
    ["12345678", "Use both letters and numbers."],
    ["пароль12345", "Use both letters and numbers."],
    [`a1${"x".repeat(71)}`, "That password is too long."],
    [`a1${"é".repeat(36)}`, "That password is too long."],
  ])("refuses the password %j", (password, message) => {
    const result = signUpSchema.safeParse({ ...valid, password });
    expect(result.error?.issues.map((i) => i.message)).toContain(message);
  });

  it.each([
    [{ fullName: "  " }, "Enter your name."],
    [{ fullName: "x".repeat(101) }, "Keep it under 100 characters."],
    [{ email: "not-an-email" }, "Enter a valid email address."],
    [{ email: `${"a".repeat(250)}@x.dev` }, "That email address is too long."],
  ])("refuses %j", (change, message) => {
    const result = signUpSchema.safeParse({ ...valid, ...change });
    expect(result.error?.issues.map((i) => i.message)).toContain(message);
  });
});

describe("signInSchema", () => {
  it("doesn't apply the new-password rules, which may have changed since sign-up", () => {
    expect(signInSchema.safeParse({ email: "a@b.dev", password: "old" }).success).toBe(true);
  });

  it("needs a password", () => {
    expect(signInSchema.safeParse({ email: "a@b.dev", password: "" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("needs the two passwords to match", () => {
    const result = newPasswordSchema.safeParse({
      password: "engine1843",
      confirmPassword: "engine1844",
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["confirmPassword"],
      message: "The passwords don't match.",
    });
  });
});
