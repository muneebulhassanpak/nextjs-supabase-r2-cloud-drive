import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/format";
import { getMyProfile } from "@/server/services/profile";

import { ProfileForm } from "./profile-form";
import { SignOutEverywhere } from "./sign-out-everywhere";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

async function Profile() {
  const { fullName, email } = await getMyProfile();
  return (
    <div className="grid gap-6">
      <Avatar className="size-16 text-xl">
        <AvatarFallback>{initials(fullName, email)}</AvatarFallback>
      </Avatar>
      <ProfileForm fullName={fullName} email={email} />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid max-w-md gap-6" aria-hidden>
      <Skeleton className="size-16 rounded-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <div className="grid content-start gap-1">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Profile" description="Your name is shown to people you share files with.">
        <Suspense fallback={<ProfileSkeleton />}>
          <Profile />
        </Suspense>
      </Section>
      <Separator />
      <Section
        title="Sessions"
        description="Lost a device, or signed in on a shared computer? End every session, including this one. Other devices are signed out within an hour."
      >
        <SignOutEverywhere />
      </Section>
    </>
  );
}
