import { FolderOpen } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Drive" };

export default function MyDrivePage() {
  return (
    <>
      <PageHeader title="My Drive" />
      <EmptyState icon={FolderOpen} title="Your drive is empty">
        Files and folders you add will show up here.
      </EmptyState>
    </>
  );
}
