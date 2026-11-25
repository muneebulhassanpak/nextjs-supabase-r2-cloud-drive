"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { MessagePage } from "@/components/message-page";
import { Button } from "@/components/ui/button";

/** Something failed outside the drive (which has its own). */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // The server logged the details; the digest ties this screen to that log line.
    console.warn("page failed", (error as { digest?: string } | null)?.digest);
  }, [error]);

  return (
    <MessagePage
      icon={TriangleAlert}
      title="This page didn't load"
      action={
        <Button size="lg" onClick={retry}>
          Try again
        </Button>
      }
    >
      Something went wrong on our side. Try again in a moment.
    </MessagePage>
  );
}
