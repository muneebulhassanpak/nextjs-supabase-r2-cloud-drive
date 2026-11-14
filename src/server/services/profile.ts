import "server-only";
import { cache } from "react";

import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  storageUsed: number;
  storageQuota: number;
}

/** The signed-in person's profile, read as them (through row-level security). Once per request. */
export const getMyProfile = cache(async (): Promise<Profile> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("email, full_name, storage_used, storage_quota")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return {
    id: user.id,
    email: data.email,
    fullName: data.full_name,
    storageUsed: data.storage_used,
    storageQuota: data.storage_quota,
  };
});
