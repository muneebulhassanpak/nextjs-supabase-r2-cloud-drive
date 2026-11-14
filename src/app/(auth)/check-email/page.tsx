import { MailCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCard } from "../auth-card";
import { CheckEmailMessage } from "./check-email-message";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthCard
      title="Check your email"
      footer={
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <div className="grid gap-4 text-sm text-muted-foreground">
        <MailCheck className="size-10 text-foreground" aria-hidden />
        <Suspense fallback={<p>We&apos;ve sent you a link. It works for 1 hour.</p>}>
          <CheckEmailMessage />
        </Suspense>
        <p>Can&apos;t find it? Check your spam folder, or wait a minute and try again.</p>
      </div>
    </AuthCard>
  );
}
