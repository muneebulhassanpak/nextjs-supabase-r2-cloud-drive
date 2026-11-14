import {
  siCloudflare,
  siGithubactions,
  siNextdotjs,
  siPnpm,
  siPostgresql,
  siReact,
  siResend,
  siShadcnui,
  siSupabase,
  siTailwindcss,
  siTypescript,
  siVercel,
  siVitest,
  type SimpleIcon,
} from "simple-icons";

/** What Lockerly is built with (icons: Simple Icons, CC0). */
const STACK: { icon: SimpleIcon; name: string }[] = [
  { icon: siNextdotjs, name: "Next.js" },
  { icon: siReact, name: "React" },
  { icon: siTypescript, name: "TypeScript" },
  { icon: siSupabase, name: "Supabase" },
  { icon: siPostgresql, name: "PostgreSQL" },
  { icon: siCloudflare, name: "Cloudflare R2" },
  { icon: siVercel, name: "Vercel" },
  { icon: siTailwindcss, name: "Tailwind CSS" },
  { icon: siShadcnui, name: "shadcn/ui" },
  { icon: siResend, name: "Resend" },
  { icon: siVitest, name: "Vitest" },
  { icon: siGithubactions, name: "GitHub Actions" },
  { icon: siPnpm, name: "pnpm" },
];

/** The stack as a grid of circles, one technology in each, named underneath. */
export function StackGrid() {
  return (
    <ul className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-6 gap-y-8 sm:gap-x-10">
      {STACK.map(({ icon, name }) => (
        <li key={name} className="group grid w-20 reveal justify-items-center gap-3 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-card text-foreground shadow-soft ring-1 ring-border transition-[translate,box-shadow,color] duration-300 ease-out-quint group-hover:-translate-y-1 group-hover:text-primary group-hover:shadow-float sm:size-20">
            <svg viewBox="0 0 24 24" className="size-7 fill-current sm:size-8" aria-hidden>
              <path d={icon.path} />
            </svg>
          </span>
          <span className="text-xs font-medium text-muted-foreground">{name}</span>
        </li>
      ))}
    </ul>
  );
}
