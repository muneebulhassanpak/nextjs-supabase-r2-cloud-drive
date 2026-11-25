import { leaveDemo } from "@/app/(auth)/demo-actions";
import { Button } from "@/components/ui/button";
import { DEMO_RESET_TIME } from "@/lib/demo";
import { getMyProfile } from "@/server/services/profile";

/** Tells people they're in the shared demo, and how to get a drive of their own. */
export async function DemoBanner() {
  const { isDemo } = await getMyProfile();
  if (!isDemo) return null;
  return (
    <aside
      aria-label="Demo"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-primary-subtle px-4 py-2 text-sm text-primary-subtle-foreground"
    >
      <p>You&apos;re in the shared demo. Try anything: it resets every day at {DEMO_RESET_TIME}.</p>
      <form action={leaveDemo}>
        <Button type="submit" size="sm" variant="outline">
          Create your own account
        </Button>
      </form>
    </aside>
  );
}
