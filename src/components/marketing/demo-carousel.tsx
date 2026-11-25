"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

/** Clips recorded from the real app by `pnpm record:demos` (public/demos), light and dark. */
const DEMOS = [
  {
    id: "upload",
    title: "Upload",
    description: "Drop in several files at once and watch each one arrive.",
  },
  {
    id: "preview",
    title: "Preview",
    description: "Open photos, text and code in place, and step through the folder.",
  },
  {
    id: "organise",
    title: "Organise",
    description: "Make folders, move in and out with breadcrumbs, switch to a grid.",
  },
] as const;

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/**
 * The clips, one at a time: each plays through and hands over to the next, like a looping GIF
 * that tells a story. Each clip exists in both themes and the page's theme picks which one shows.
 * Clips only play while on screen, never start by themselves for people who prefer less motion,
 * and can always be paused.
 */
export function DemoCarousel() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const { resolvedTheme } = useTheme();
  // Which recording the page shows. Read from the theme, not the page: next-themes updates the
  // page's class after this component's effects run.
  const shown: Theme = resolvedTheme === "dark" ? "dark" : "light";
  const videos = useRef<Record<Theme, (HTMLVideoElement | null)[]>>({ light: [], dark: [] });
  // Posters and clips wait until the carousel is close: most of a first load would be theirs.
  const [near, setNear] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const onScreen = useRef(false);
  // Whether the person paused (or, preferring less motion, hasn't pressed play yet).
  const held = useRef(false);

  useEffect(() => {
    held.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setCurrent(api.selectedScrollSnap());
      setProgress(0);
    };
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  /** Plays the shown clip (if it should be playing) and pauses every other. */
  const sync = useCallback(() => {
    const run = onScreen.current && !held.current;
    for (const theme of THEMES) {
      videos.current[theme].forEach((video, index) => {
        if (!video) return;
        if (run && index === current && theme === shown) {
          void video.play().catch(() => {
            // Autoplay refused (a power-saving mode, say): offer the play button instead.
            held.current = true;
            setPlaying(false);
          });
        } else {
          video.pause();
        }
      });
    }
    setPlaying(run);
  }, [current, shown]);
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // A newly shown clip starts from the top.
  useEffect(() => {
    for (const theme of THEMES) {
      const video = videos.current[theme][current];
      if (video) video.currentTime = 0;
    }
    syncRef.current();
  }, [current]);

  // The theme changed: carry on from the same moment in the other recording.
  useEffect(() => {
    const next = videos.current[shown][current];
    const previous = videos.current[shown === "dark" ? "light" : "dark"][current];
    if (next && previous) next.currentTime = previous.currentTime;
    syncRef.current();
    // `current` is read, not watched: changing clips is handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Play only while the carousel is on screen.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen.current = entry?.isIntersecting ?? false;
        syncRef.current();
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  function toggle() {
    held.current = !held.current;
    sync();
  }

  function onTimeUpdate(theme: Theme, index: number, event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (index !== current || theme !== shown || !video.duration) return;
    setProgress(video.currentTime / video.duration);
  }

  return (
    <div ref={root} className="grid gap-8">
      <div
        className="flex flex-wrap items-center justify-center gap-2"
        role="group"
        aria-label="Choose a clip"
      >
        {DEMOS.map((demo, index) => {
          const active = index === current;
          return (
            <button
              key={demo.id}
              type="button"
              aria-pressed={active}
              onClick={() => api?.scrollTo(index)}
              className={cn(
                "relative isolate overflow-hidden rounded-full px-5 py-2 text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-muted text-primary-subtle-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {/* The pill fills from left to right as the clip plays. */}
              {active && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 -z-10 origin-left bg-primary-subtle",
                    progress > 0 && "transition-transform duration-300 ease-linear",
                  )}
                  style={{ transform: `scaleX(${String(progress)})` }}
                />
              )}
              {demo.title}
            </button>
          );
        })}
      </div>

      <Carousel setApi={setApi} opts={{ loop: true }} className="mx-auto w-full max-w-4xl">
        <CarouselContent>
          {DEMOS.map((demo, index) => (
            <CarouselItem key={demo.id} aria-label={`${demo.title}: ${demo.description}`}>
              <figure className="grid gap-4">
                <div className="overflow-hidden rounded-2xl bg-card shadow-float ring-1 ring-border">
                  <div className="flex items-center gap-1.5 border-b px-4 py-3" aria-hidden>
                    {[0, 1, 2].map((dot) => (
                      <span key={dot} className="size-2.5 rounded-full bg-border" />
                    ))}
                  </div>
                  {THEMES.map((theme) => {
                    const file = theme === "dark" ? `${demo.id}-dark` : demo.id;
                    return (
                      <video
                        key={theme}
                        ref={(element) => {
                          videos.current[theme][index] = element;
                        }}
                        className={cn(
                          "aspect-[8/5] w-full bg-card",
                          theme === "light" ? "dark:hidden" : "hidden dark:block",
                        )}
                        poster={near && theme === shown ? `/demos/${file}.jpg` : undefined}
                        muted
                        playsInline
                        preload={
                          !near || theme !== shown ? "none" : index === 0 ? "auto" : "metadata"
                        }
                        aria-label={`${demo.title} in Lockerly: ${demo.description}`}
                        onTimeUpdate={(event) => {
                          onTimeUpdate(theme, index, event);
                        }}
                        onEnded={() => {
                          if (theme === shown) api?.scrollNext();
                        }}
                      >
                        <source src={`/demos/${file}.webm`} type="video/webm" />
                        <source src={`/demos/${file}.mp4`} type="video/mp4" />
                      </video>
                    );
                  })}
                </div>
                <figcaption className="text-center text-sm text-muted-foreground">
                  {demo.description}
                </figcaption>
              </figure>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="mt-2 flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => api?.scrollPrev()}>
            <ChevronLeft />
            <span className="sr-only">Previous clip</span>
          </Button>
          <Button variant="outline" size="icon" onClick={toggle}>
            {playing ? <Pause /> : <Play />}
            <span className="sr-only">{playing ? "Pause" : "Play"}</span>
          </Button>
          <Button variant="outline" size="icon" onClick={() => api?.scrollNext()}>
            <ChevronRight />
            <span className="sr-only">Next clip</span>
          </Button>
        </div>
      </Carousel>
    </div>
  );
}
