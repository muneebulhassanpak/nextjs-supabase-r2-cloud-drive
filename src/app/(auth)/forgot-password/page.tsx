import { TextLink } from "@/components/text-link";

import { AuthCard } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a link to choose a new password."
      footer={<TextLink href="/sign-in">Back to sign in</TextLink>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
