import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

import { AuthCard } from "../../auth-card";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Link expired" };

export default function AuthErrorPage() {
  return (
    <AuthCard
      title="That link didn't work"
      description="It may have expired (links work for 1 hour) or already been used. Each link works once."
    >
      <div className="grid gap-2">
        <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
          Sign in
        </Link>
        <Link
          href="/forgot-password"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          Get a new reset link
        </Link>
      </div>
    </AuthCard>
  );
}
