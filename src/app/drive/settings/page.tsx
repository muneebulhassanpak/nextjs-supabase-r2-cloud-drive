import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { avatarSrc } from "@/lib/files/rules";
import { initials } from "@/lib/format";
import { getMyProfile } from "@/server/services/profile";

import { AvatarForm } from "./avatar-form";
import { ProfileForm } from "./profile-form";
import { SignOutEverywhere } from "./sign-out-everywhere";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

async function Profile() {
  const { id, fullName, email, avatarKey, isDemo } = await getMyProfile();
  if (isDemo) {
    return (
      <div className="grid max-w-md gap-4">
        <p className="font-medium">{fullName}</p>
        <p className="text-sm text-muted-foreground">
          Everyone who tries the demo shares this account, so its name, picture, email and password
          can&apos;t be changed.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <AvatarForm src={avatarSrc(id, avatarKey)} fallback={initials(fullName, email)} />
      <ProfileForm fullName={fullName} email={email} />
    </div>
  );
}

/** Not offered in the demo, where it would end everyone else's visit too. */
async function Sessions() {
  const { isDemo } = await getMyProfile();
  return isDemo ? (
    <p className="text-sm text-muted-foreground">Not available in the demo.</p>
  ) : (
    <SignOutEverywhere />
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
      <Section
        title="Profile"
        description="Your name and picture are shown to people you share files with."
      >
        <Suspense fallback={<ProfileSkeleton />}>
          <Profile />
        </Suspense>
      </Section>
      <Separator />
      <Section
        title="Sessions"
        description="Lost a device, or signed in on a shared computer? End every session, including this one. Other devices are signed out within an hour."
      >
        <Suspense fallback={<Skeleton className="h-9 w-40" />}>
          <Sessions />
        </Suspense>
      </Section>
    </>
  );
}
