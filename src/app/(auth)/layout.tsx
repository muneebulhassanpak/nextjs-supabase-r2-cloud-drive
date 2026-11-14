import { SiteHeader } from "@/components/marketing/site-header";
import { Backdrop } from "@/components/ui/backdrop";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative isolate flex flex-1 flex-col bg-canvas">
      <Backdrop glow="none" />
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md motion-safe:animate-enter">{children}</div>
      </main>
    </div>
  );
}
