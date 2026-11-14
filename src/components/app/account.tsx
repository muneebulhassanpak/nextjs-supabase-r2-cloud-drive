import { Skeleton } from "@/components/ui/skeleton";
import { avatarSrc } from "@/lib/files/rules";
import { getMyProfile } from "@/server/services/profile";

import { UserMenu } from "./user-menu";

/** The signed-in person's menu. Reads the profile, so render it inside <Suspense>. */
export async function Account() {
  const { id, fullName, email, avatarKey } = await getMyProfile();
  return <UserMenu name={fullName} email={email} avatar={avatarSrc(id, avatarKey)} />;
}

export function AccountSkeleton() {
  return <Skeleton className="size-8 rounded-full" aria-hidden />;
}
