import { Trash2 } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trash" };

export default function TrashPage() {
  return (
    <>
      <PageHeader title="Trash" />
      <EmptyState icon={Trash2} title="Trash is empty">
        Items you delete stay here for 30 days, then they&apos;re removed for good.
      </EmptyState>
    </>
  );
}
