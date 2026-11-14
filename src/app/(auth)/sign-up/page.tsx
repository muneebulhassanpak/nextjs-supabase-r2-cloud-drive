import { TextLink } from "@/components/text-link";

import { AuthCard } from "../auth-card";
import { SignUpForm } from "./sign-up-form";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="100 MB of free storage. We'll email you a link to confirm your address."
      footer={
        <>
          Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
