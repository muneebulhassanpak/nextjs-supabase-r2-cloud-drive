import { MailCheck } from "lucide-react";
import { Suspense } from "react";

import { TextLink } from "@/components/text-link";

import { AuthCard } from "../auth-card";
import { CheckEmailMessage } from "./check-email-message";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthCard
      title="Check your email"
      icon={MailCheck}
      footer={<TextLink href="/sign-in">Back to sign in</TextLink>}
    >
      <div className="grid gap-3 text-center text-sm text-balance text-muted-foreground">
        <Suspense fallback={<p>We&apos;ve sent you a link. It works for 1 hour.</p>}>
          <CheckEmailMessage />
        </Suspense>
        <p>Can&apos;t find it? Check your spam folder, or wait a minute and try again.</p>
      </div>
    </AuthCard>
  );
}
