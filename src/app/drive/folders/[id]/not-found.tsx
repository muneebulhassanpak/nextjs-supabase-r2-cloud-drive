import { FolderX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function FolderNotFound() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <EmptyState icon={FolderX} title="We couldn't find that folder">
        It may have been moved, deleted, or not shared with you.
      </EmptyState>
      <Link
        href="/drive"
        className={buttonVariants({ variant: "outline", className: "self-center" })}
      >
        Back to My Drive
      </Link>
    </div>
  );
}
