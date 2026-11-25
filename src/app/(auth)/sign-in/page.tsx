import { DemoButton } from "@/components/demo-button";
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
      <div className="grid gap-4">
        <SignInForm />
        <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          or just look around
        </div>
        <DemoButton variant="outline" size="lg" className="w-full" />
      </div>
    </AuthCard>
  );
}
