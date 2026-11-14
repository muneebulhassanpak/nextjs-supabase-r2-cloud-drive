import { Star } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Starred" };

export default function StarredPage() {
  return (
    <>
      <PageHeader title="Starred" />
      <EmptyState icon={Star} title="No starred files">
        Star the files and folders you use most to find them quickly.
      </EmptyState>
    </>
  );
}
