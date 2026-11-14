import { z } from "zod";

/**
 * What the auth forms accept. The same rules are enforced by Supabase Auth (config.toml:
 * `minimum_password_length`, `password_requirements`); checking here first gives clear messages.
 */

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything after 72 bytes, so longer passwords would be silently truncated.
const PASSWORD_MAX_BYTES = 72;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES, {
    message: "That password is too long.",
  })
  // Matches Supabase's `letters_digits` rule, which counts only A-Z, a-z and 0-9.
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
    message: "Use both letters and numbers.",
  });

export const fullName = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(100, "Keep it under 100 characters.");

export const signUpSchema = z.object({ fullName, email, password: newPassword });

// Sign-in only checks that something was typed: the rules may have changed since the account was made.
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const emailSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The passwords don't match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({ fullName });
