import { createCn } from "cn/config";

/**
 * Joins class names and drops the ones a later class overrides. It's told about the design
 * tokens in globals.css that it can't guess: `text-display` is a size, not a colour, `bg-grid` is a
 * pattern and `shadow-soft` a shadow, `max-w-page` a width, and the motion utilities (`stagger-*`,
 * `reveal`, `scroll-edge`) are their own groups.
 */
export const cn = createCn<"stagger" | "reveal" | "scroll-edge">({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "headline", "title"] }],
      "bg-image": [{ bg: ["grid"] }],
      "max-w": [{ "max-w": ["page"] }],
      shadow: [{ shadow: ["soft", "float"] }],
      stagger: [{ stagger: [(value: string) => /^\d+$/.test(value)] }],
      reveal: ["reveal"],
      "scroll-edge": ["scroll-edge"],
    },
  },
});
