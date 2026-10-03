"use client";

/**
 * Keyword Input
 *
 * macOS-style token field: neutral rounded tokens followed by a text cursor.
 * Enter or comma commits the current word, Backspace on an empty field removes
 * the last token, and a pasted comma-separated list becomes several tokens.
 */

import { useI18n } from "@/lib/i18n/provider";
import { X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

interface KeywordInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  max?: number;
  /** Placeholder while there are no tokens yet. */
  placeholder?: string;
  /** Store keywords in upper case (the original behavior). */
  uppercase?: boolean;
}

export default function KeywordInput({
  keywords,
  onChange,
  max = 10,
  placeholder,
  uppercase = true,
}: KeywordInputProps) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addKeywords(values: string[]) {
    const next = [...keywords];
    for (const value of values) {
      const trimmed = uppercase ? value.trim().toUpperCase() : value.trim();
      if (!trimmed) continue;
      if (next.includes(trimmed)) continue;
      if (next.length >= max) break;
      next.push(trimmed);
    }
    if (next.length !== keywords.length) onChange(next);
    setInput("");
  }

  function removeKeyword(keyword: string) {
    onChange(keywords.filter((k) => k !== keyword));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeywords([input]);
    }
    if (e.key === "Backspace" && !input && keywords.length > 0) {
      removeKeyword(keywords[keywords.length - 1]);
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-9 cursor-text flex-wrap items-center gap-1.5 rounded-sm border border-transparent bg-surface-2 px-1.5 py-1.5 focus-within:border-accent focus-within:bg-surface focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
      >
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex max-w-full items-center gap-0.5 rounded-[6px] bg-foreground/[0.08] py-0.5 pl-2 pr-0.5 text-[13px] leading-5 text-foreground"
          >
            <span className="truncate">{keyword}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeKeyword(keyword);
              }}
              aria-label={t("Remove {keyword}", { keyword })}
              className="grid size-4 shrink-0 place-items-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground"
            >
              <X aria-hidden strokeWidth={2.2} className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            const value = e.target.value;
            // A pasted "a, b, c" turns into three tokens at once.
            if (value.includes(",")) {
              const parts = value.split(",");
              const rest = parts.pop() ?? "";
              addKeywords(parts);
              setInput(rest);
              return;
            }
            setInput(value);
          }}
          onKeyDown={handleKeyDown}
          // Commit a half-typed word when the field loses focus, so it is not
          // silently dropped when the user clicks Save right after typing.
          onBlur={() => input.trim() && addKeywords([input])}
          placeholder={
            keywords.length === 0
              ? placeholder ?? t("Type keyword and press Enter...")
              : ""
          }
          className="min-w-[96px] flex-1 bg-transparent px-1.5 text-[15px] leading-5 text-foreground outline-none placeholder:text-tertiary focus-visible:outline-none"
        />
      </div>
      <p className="caption px-0.5">
        <span className="numeral">
          {keywords.length}/{max}
        </span>{" "}
        {t("keywords · Press Enter or comma to add")}
      </p>
    </div>
  );
}
