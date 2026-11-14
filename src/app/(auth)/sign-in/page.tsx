import Link from "next/link";

import { AuthCard } from "../auth-card";
import { SignInForm } from "./sign-in-form";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your Lockerly account."
      footer={
        <>
          New to Lockerly?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm />
    </AuthCard>
  );
}
