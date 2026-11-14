import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { ComponentProps } from "react";

const textLink = cva(
  "rounded-sm underline-offset-4 transition-colors outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
  {
    variants: {
      tone: {
        /** In a sentence: stands out from the muted text around it. */
        default: "font-medium text-foreground",
        /** Secondary links (footers, "Forgot password?"): quiet until hovered. */
        muted: "text-muted-foreground hover:text-foreground",
        brand: "font-medium text-primary",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

/** A link inside text. For links that look like buttons, use `buttonVariants`. */
export function TextLink({
  className,
  tone,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof textLink>) {
  return <Link className={cn(textLink({ tone }), className)} {...props} />;
}
