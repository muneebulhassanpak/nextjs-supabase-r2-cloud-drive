import { createCn } from "cn/config";

/**
 * Joins class names and drops the ones a later class overrides. It's told about the design
 * tokens in globals.css that it can't guess: `text-display` is a size, not a colour, and
 * `bg-grid` is a pattern and `shadow-soft` a shadow, not colours.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "headline", "title"] }],
      "bg-image": [{ bg: ["grid"] }],
      shadow: [{ shadow: ["soft", "float"] }],
    },
  },
});
