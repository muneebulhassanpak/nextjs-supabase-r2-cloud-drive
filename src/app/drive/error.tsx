"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

/** Something failed while loading a page of the drive. The sidebar and top bar stay usable. */
export default function DriveError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // The server logged the details; the digest ties this screen to that log line.
    console.warn("drive page failed", (error as { digest?: string } | null)?.digest);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <EmptyState icon={TriangleAlert} title="This page didn't load">
        Something went wrong on our side. Try again in a moment.
      </EmptyState>
      <Button variant="outline" className="self-center" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
