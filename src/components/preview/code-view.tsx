"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { HIGHLIGHT_MAX_BYTES } from "@/lib/files/preview";

import type { HighlighterCore } from "shiki/core";

// One highlighter for the page, made on first use: Shiki's core with the JavaScript regex engine
// (no WebAssembly download), the two themes, and each language loaded only when a file needs it.
let highlighter: Promise<HighlighterCore> | undefined;
async function highlight(text: string, language: string) {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  const shiki = await highlighter;
  const { bundledLanguages } = await import("shiki/langs");
  if (!(language in bundledLanguages)) return null;
  await shiki.loadLanguage(bundledLanguages[language as keyof typeof bundledLanguages]);
  return shiki.codeToTokens(text, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}

interface Token {
  content: string;
  style: CSSProperties | undefined;
}

/**
 * Text with line numbers, highlighted once Shiki has loaded (it's large, so only previews load it).
 * Tokens become React elements, never HTML, so a file's contents can't turn into markup. Colours
 * come as CSS variables for both themes, so switching theme needs no second pass.
 */
export function CodeView({ text: raw, language }: { text: string; language: string }) {
  // A final newline ends the last line; it doesn't start an empty one.
  const text = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  const [highlighted, setHighlighted] = useState<{ text: string; lines: Token[][] } | null>(null);
  const highlightable = language !== "text" && text.length <= HIGHLIGHT_MAX_BYTES;

  useEffect(() => {
    if (!highlightable) return;
    let live = true;
    highlight(text, language)
      .then((result) => {
        if (!live || !result) return;
        const { tokens } = result;
        setHighlighted({
          text,
          lines: tokens.map((line) =>
            line.map((token) => ({
              content: token.content,
              style: token.htmlStyle,
            })),
          ),
        });
      })
      // Highlighting is a nicety: the plain text stays if it fails.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [text, language, highlightable]);

  // Long text stays one block: tens of thousands of numbered lines would be slow to show.
  if (!highlightable) {
    return <pre className="code-view p-4 font-mono text-xs leading-5 sm:text-sm">{text}</pre>;
  }

  const lines =
    highlighted?.text === text
      ? highlighted.lines
      : text.split("\n").map((line) => [{ content: line, style: undefined }]);
  return (
    <pre className="code-view py-4 font-mono text-xs leading-5 sm:text-sm">
      <code className="grid grid-cols-[auto_1fr]">
        {lines.map((line, index) => (
          <span key={index} className="contents">
            <span className="pr-4 pl-4 text-right text-muted-foreground/60 select-none">
              {index + 1}
            </span>
            <span className="pr-4 whitespace-pre">
              {line.map((token, i) => (
                <span key={i} style={token.style}>
                  {token.content}
                </span>
              ))}
              {line.length === 0 && " "}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
