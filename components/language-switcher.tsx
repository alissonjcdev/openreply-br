"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { setLocale } from "@/lib/i18n/actions";
import { useI18n } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n";

// Each language is written in itself, so it stays recognisable whatever the
// current interface language is.
const LANGUAGES: ReadonlyArray<{ value: Locale; name: string }> = [
  { value: "pt-BR", name: "Português (Brasil)" },
  { value: "en", name: "English" },
  { value: "zh-TW", name: "繁體中文" },
];

/**
 * Language menu (macOS pop-up button: current value + popover list with a
 * checkmark). `row` renders a full settings row (label left, menu right);
 * `compact` renders the menu button alone, for page corners.
 */
export default function LanguageSwitcher({
  variant = "compact",
}: {
  variant?: "row" | "compact";
}) {
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const menuId = useId();

  const current = LANGUAGES.find((l) => l.value === locale) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(nextLocale: Locale) {
    setOpen(false);
    if (nextLocale === locale) return;
    setFailed(false);
    startTransition(async () => {
      try {
        await setLocale(nextLocale);
      } catch {
        setFailed(true);
      }
    });
  }

  const menu = (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-labelledby={variant === "row" ? `${labelId} ${labelId}-value` : undefined}
        aria-label={variant === "compact" ? `${t("Language")}: ${current.name}` : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-md text-[14px] transition-colors disabled:opacity-50 ${
          variant === "row"
            ? "-mr-1.5 px-1.5 py-1 text-muted hover:text-foreground"
            : "h-8 px-2.5 text-muted hover:bg-foreground/[0.05] hover:text-foreground"
        }`}
      >
        <span id={`${labelId}-value`} lang={current.value}>
          {current.name}
        </span>
        <ChevronsUpDown aria-hidden strokeWidth={1.9} className="size-3.5 text-tertiary" />
      </button>

      {open && (
        <ul
          id={menuId}
          role="listbox"
          aria-label={t("Language")}
          className="popover absolute right-0 top-[calc(100%+4px)] z-40 min-w-[200px] p-1"
        >
          {LANGUAGES.map((language) => {
            const selected = language.value === locale;
            return (
              <li key={language.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  lang={language.value}
                  onClick={() => choose(language.value)}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[14px] text-foreground hover:bg-accent hover:text-on-accent"
                >
                  <Check
                    aria-hidden
                    strokeWidth={2.2}
                    className={`size-3.5 shrink-0 ${selected ? "" : "invisible"}`}
                  />
                  <span className="truncate">{language.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const error = failed && (
    <p role="alert" className="text-[13px] text-error">
      {t("Could not change language. Please try again.")}
    </p>
  );

  if (variant === "compact") {
    return (
      <div className="flex flex-col items-end gap-1">
        {menu}
        {error}
      </div>
    );
  }

  return (
    <div className="group-row flex-wrap">
      <span id={labelId} className="text-[15px]">
        {t("Language")}
      </span>
      <div className="ml-auto">{menu}</div>
      {error && <div className="basis-full">{error}</div>}
    </div>
  );
}
