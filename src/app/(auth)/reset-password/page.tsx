import { AuthCard } from "../auth-card";
import { ResetPasswordForm } from "./reset-password-form";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      description="You'll stay signed in on this device. Other devices keep their session until they sign out."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
