import { TextLink } from "@/components/text-link";

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
          New to Lockerly? <TextLink href="/sign-up">Create an account</TextLink>
        </>
      }
    >
      <SignInForm />
    </AuthCard>
  );
}
