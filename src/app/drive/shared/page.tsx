import { Users } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Shared with me" };

export default function SharedPage() {
  return (
    <>
      <PageHeader title="Shared with me" />
      <EmptyState icon={Users} title="Nothing shared with you yet">
        When someone shares a file or folder with you, it shows up here.
      </EmptyState>
    </>
  );
}
