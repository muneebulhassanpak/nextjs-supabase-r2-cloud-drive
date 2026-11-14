import { Clock } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Recent" };

export default function RecentPage() {
  return (
    <>
      <PageHeader title="Recent" />
      <EmptyState icon={Clock} title="No recent files">
        Files you open or change show up here, newest first.
      </EmptyState>
    </>
  );
}
