"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Nav } from "./nav";

/** The sidebar as a slide-in panel on phones. `footer` is the storage meter, rendered on the server. */
export function MobileNav({ footer }: { footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="px-6 py-4">
          <SheetTitle>
            <Brand />
          </SheetTitle>
          <SheetDescription className="sr-only">Go to a section of your drive</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col justify-between gap-6 px-3 pb-6">
          <Nav
            onNavigate={() => {
              setOpen(false);
            }}
          />
          {footer}
        </div>
      </SheetContent>
    </Sheet>
  );
}
