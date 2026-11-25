import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { MessagePage } from "@/components/message-page";
import { buttonVariants } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <MessagePage
      icon={FileQuestion}
      title="There's nothing here"
      action={
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Go to the home page
        </Link>
      }
    >
      The address may be mistyped, or the page may have moved.
    </MessagePage>
  );
}
