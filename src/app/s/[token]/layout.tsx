import { Container } from "@/components/marketing/section";
import { SiteHeader } from "@/components/marketing/site-header";

import type { Metadata } from "next";

// Shared links are for the people they were sent to: never in search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LinkLayout({ children }: LayoutProps<"/s/[token]">) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col py-6 sm:py-8">
        <Container className="flex flex-1 flex-col">{children}</Container>
      </main>
    </div>
  );
}
