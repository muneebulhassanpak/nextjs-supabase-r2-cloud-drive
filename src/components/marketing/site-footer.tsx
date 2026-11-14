import { Brand } from "@/components/brand";
import { TextLink } from "@/components/text-link";
import { REPO_URL } from "@/lib/site";

import { Container } from "./section";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#security", label: "Security" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-up", label: "Create an account" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: REPO_URL, label: "Source code" },
      { href: `${REPO_URL}/blob/main/CHANGELOG.md`, label: "Changelog" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container className="grid gap-10 py-12 md:grid-cols-[2fr_3fr]">
        <div className="grid content-start gap-3">
          <Brand />
          <p className="max-w-xs text-sm text-muted-foreground">
            Store, organise, preview and share your files, privately.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="grid content-start gap-3">
              <p className="text-sm font-medium">{column.title}</p>
              {column.links.map((link) => (
                <TextLink key={link.href} href={link.href} tone="muted" className="text-sm">
                  {link.label}
                </TextLink>
              ))}
            </nav>
          ))}
        </div>
      </Container>
      <Container className="border-t py-6 text-sm text-muted-foreground">
        A portfolio project by{" "}
        <TextLink href="https://github.com/muneebulhassanpak">Muhammad Muneeb-Ul-Hassan</TextLink>.
      </Container>
    </footer>
  );
}
