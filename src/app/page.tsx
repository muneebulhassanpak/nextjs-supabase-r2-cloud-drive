import {
  ArrowRight,
  ArrowUpRight,
  Check,
  DatabaseZap,
  Eye,
  FlaskConical,
  HardDrive,
  Link2,
  ServerCog,
  ShieldCheck,
  Timer,
  Upload,
} from "lucide-react";
import Link from "next/link";

import { DemoButton } from "@/components/demo-button";
import { DemoCarousel } from "@/components/marketing/demo-carousel";
import {
  DriveMockup,
  PreviewMockup,
  StorageMockup,
  UploadsMockup,
} from "@/components/marketing/mockups";
import { Container, Eyebrow, IconChip, Panel, SectionIntro } from "@/components/marketing/section";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StackGrid } from "@/components/marketing/stack-grid";
import { TextLink } from "@/components/text-link";
import { buttonVariants } from "@/components/ui/button";
import { FolderCard } from "@/components/ui/folder-card";
import { REPO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

const REASONS = [
  {
    icon: ShieldCheck,
    title: "Private by default",
    href: "#security",
    body: "Everything you upload is yours alone. The database checks who may see each file, on every request.",
  },
  {
    icon: Eye,
    title: "Opens in the browser",
    href: "#previews",
    body: "Photos, PDFs, video, audio and code open in place, with the rest of the folder a key press away.",
  },
  {
    icon: Upload,
    title: "Drop files anywhere",
    href: "#uploads",
    body: "Drag files onto any folder. Uploads carry on while you move around, and one that fails can be retried in a click.",
  },
];

const FEATURES: {
  id: string;
  title: string;
  body: string;
  points: string[];
  picture: ReactNode;
}[] = [
  {
    id: "storage",
    title: "See where your space goes",
    body: "Every account starts with 100 MB. The sidebar shows what's used at a glance, and uploads that won't fit are stopped before they start.",
    points: ["Up to 25 MB per file", "Space comes back when you delete", "No surprise limits"],
    picture: <StorageMockup />,
  },
  {
    id: "previews",
    title: "Open files without downloading",
    body: "A full-screen viewer for the files you use most. Step through a folder with the arrow keys, zoom into photos, and read code with highlighting.",
    points: [
      "Images, PDF, video, audio, text and code",
      "Scripts are shown as source, never run",
      "Download anything in one click",
    ],
    picture: <PreviewMockup />,
  },
  {
    id: "uploads",
    title: "Uploads you can rely on",
    body: "Files go straight from your browser to storage, so big uploads stay fast. You see each one's progress, and nothing half-finished is left behind.",
    points: [
      "Cancel or retry any file",
      "Name clashes become “name (1)”, never overwrite",
      "Keeps going while you browse",
    ],
    picture: <UploadsMockup />,
  },
];

const SAFEGUARDS = [
  {
    icon: DatabaseZap,
    title: "Row-level security",
    body: "Postgres decides what each person can read or change, on every table. A bug in the app can't hand out someone else's files.",
  },
  {
    icon: Timer,
    title: "Links that expire",
    body: "Files are reached through signed links that stop working within minutes. Nothing in storage is public.",
  },
  {
    icon: ServerCog,
    title: "Storage kept apart",
    body: "File contents live in Cloudflare R2, separate from the database, and only the server can sign a way in.",
  },
  {
    icon: FlaskConical,
    title: "Tested from every angle",
    body: "Database tests try every role against every rule, and browser tests run the real app on each change.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />

        <section aria-labelledby="stack-heading" className="py-16 sm:py-20">
          <Container className="grid gap-12">
            <SectionIntro
              id="stack-heading"
              align="center"
              eyebrow="Built with"
              title="A modern, well-tested stack"
              description="Every piece is a widely used, production-grade tool, so Lockerly is easy to run, extend and hand over."
            />
            <StackGrid />
          </Container>
        </section>

        <section aria-labelledby="demo-heading" className="py-16 sm:py-24">
          <Container className="grid gap-12">
            <SectionIntro
              id="demo-heading"
              align="center"
              eyebrow="See it in action"
              title="Recorded in the real app"
              description="Not mock-ups: a script drives Lockerly in a browser and records what you'd see."
            />
            <Panel glow="none" className="sm:py-14">
              <DemoCarousel />
            </Panel>
          </Container>
        </section>

        <section
          id="features"
          aria-labelledby="why-heading"
          className="scroll-mt-20 py-16 sm:py-24"
        >
          <Container className="grid gap-12">
            <SectionIntro
              id="why-heading"
              eyebrow="Why Lockerly"
              title="A drive that keeps things simple, and keeps them yours"
              description="Lockerly does the everyday things well: put files in, find them again, open them anywhere. The security is built into the database, not bolted on."
            />
            <div className="grid gap-6 md:grid-cols-3">
              {REASONS.map((reason, index) => {
                const Icon = reason.icon;
                const highlight = index === 0;
                return (
                  // Each card leads to the part of the page that says more.
                  <Link
                    key={reason.title}
                    href={reason.href}
                    className="group flex reveal rounded-2xl transition-[translate,filter] duration-300 ease-out-quint outline-none hover:-translate-y-1 hover:drop-shadow-xl focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <FolderCard tone={highlight ? "brand" : "canvas"} className="flex-1">
                      <div className="flex items-start justify-between">
                        <IconChip inverse={highlight}>
                          <Icon />
                        </IconChip>
                        <ArrowUpRight
                          className="size-5 opacity-60 transition-[translate,opacity] duration-300 ease-out-quint group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                          aria-hidden
                        />
                      </div>
                      <h3 className="mt-10 text-title">{reason.title}</h3>
                      <p
                        className={
                          highlight
                            ? "mt-2 text-sm text-brand-foreground/90"
                            : "mt-2 text-sm text-muted-foreground"
                        }
                      >
                        {reason.body}
                      </p>
                    </FolderCard>
                  </Link>
                );
              })}
            </div>
          </Container>
        </section>

        <section aria-labelledby="features-heading" className="py-16 sm:py-24">
          <Container className="grid gap-16 sm:gap-24">
            <SectionIntro
              id="features-heading"
              eyebrow="Features"
              title="Everything you need to keep files in order"
              description="Folders, previews and uploads that behave the way you expect, on a phone or a big screen."
            />
            {FEATURES.map((feature, index) => (
              <div
                key={feature.id}
                id={feature.id}
                className="grid reveal scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <Panel
                  glow="none"
                  className={cn("flex justify-center", index % 2 === 1 && "lg:order-2")}
                >
                  {feature.picture}
                </Panel>
                <div className="grid gap-5 lg:px-6">
                  <h3 className="text-title">{feature.title}</h3>
                  <p className="text-pretty text-muted-foreground">{feature.body}</p>
                  <ul className="grid gap-3">
                    {feature.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </Container>
        </section>

        <section
          id="security"
          aria-labelledby="security-heading"
          className="scroll-mt-20 py-16 sm:py-24"
        >
          <Container>
            <Panel className="py-14 lg:py-20">
              <div className="grid gap-12 lg:grid-cols-[2fr_3fr] lg:gap-16">
                <div className="grid content-start gap-4">
                  <Eyebrow>Security</Eyebrow>
                  <h2 id="security-heading" className="text-headline text-balance">
                    Secure by design, not by promise
                  </h2>
                  <p className="text-pretty text-muted-foreground">
                    The rules about who can see what live in the database itself, and every one of
                    them is tested. The code is open, so you can check.
                  </p>
                  <TextLink
                    href={REPO_URL}
                    tone="brand"
                    className="group mt-2 inline-flex w-fit items-center gap-1.5"
                  >
                    Read the code on GitHub{" "}
                    <ArrowRight
                      className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </TextLink>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {SAFEGUARDS.map(({ icon: Icon, title, body }) => (
                    <li
                      key={title}
                      className="grid reveal content-start gap-4 rounded-2xl bg-card p-6 shadow-soft ring-1 ring-border transition-shadow duration-300 hover:shadow-float"
                    >
                      <IconChip>
                        <Icon />
                      </IconChip>
                      <div className="grid gap-1.5">
                        <h3 className="font-medium">{title}</h3>
                        <p className="text-sm text-muted-foreground">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </Container>
        </section>

        <section aria-labelledby="start-heading" className="pt-8 pb-16 sm:pb-24">
          <Container>
            <Panel tone="brand" className="py-16 text-center sm:py-20">
              <div className="mx-auto grid max-w-xl reveal justify-items-center gap-5">
                <h2 id="start-heading" className="text-headline text-balance">
                  Start with 100 MB, free
                </h2>
                <p className="text-pretty text-brand-foreground/90">
                  Create an account, confirm your email, and upload your first file in a minute.
                </p>
                <Link
                  href="/sign-up"
                  className={buttonVariants({ variant: "inverse", size: "xl" })}
                >
                  Get started free
                  <ArrowRight data-icon="inline-end" aria-hidden />
                </Link>
              </div>
            </Panel>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <Container className="pt-2">
      <Panel className="sm:py-16 lg:py-20">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          <div className="grid justify-items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-card py-1 pr-3 pl-1.5 text-sm shadow-soft ring-1 ring-border stagger-0 motion-safe:animate-enter">
              <span className="grid size-6 place-items-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
                <ShieldCheck className="size-3.5" aria-hidden />
              </span>
              Private by default
            </span>
            {/* Not faded in: it's the first thing people read, and what the page is timed by. */}
            <h1 className="text-display text-balance">Your files, safe and always within reach</h1>
            <p className="max-w-lg text-lg text-pretty text-muted-foreground stagger-2 motion-safe:animate-enter">
              Upload, organise, preview and share files from any device. Every folder stays private
              until you choose otherwise.
            </p>
            <div className="flex flex-wrap gap-3 stagger-3 motion-safe:animate-enter">
              <Link href="/sign-up" className={buttonVariants({ size: "xl" })}>
                Create a free account
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
              <DemoButton size="xl" variant="outline" />
            </div>
            <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-4 stagger-4 motion-safe:animate-enter">
              <FolderCard tone="brand">
                <HardDrive className="size-5 opacity-80" aria-hidden />
                <p className="mt-6 text-title whitespace-nowrap sm:text-headline">100 MB</p>
                <p className="text-sm text-brand-foreground/90">free to start</p>
              </FolderCard>
              <FolderCard tone="card">
                <Link2 className="size-5 text-primary" aria-hidden />
                <p className="mt-6 text-title whitespace-nowrap sm:text-headline">60 s</p>
                <p className="text-sm text-muted-foreground">until a download link expires</p>
              </FolderCard>
            </div>
          </div>
          <div className="stagger-3 motion-safe:animate-enter lg:pl-4">
            <DriveMockup />
          </div>
        </div>
      </Panel>
    </Container>
  );
}
