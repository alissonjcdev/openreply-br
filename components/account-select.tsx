"use client";

/**
 * Account picker — a macOS pop-up button.
 *
 * A capsule button that shows the current account and opens a translucent
 * menu (`.popover`) with a checkmark on the selected item. Never a native
 * <select>. The menu is positioned `fixed` from the button's rect and portaled to
 * <body>, so grouped containers that hide their overflow never clip it.
 */

import { useI18n } from "@/lib/i18n/provider";
import { Check, ChevronsUpDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface AccountOption {
  id: string;
  username: string;
  instagramId: string;
  name?: string | null;
}

interface AccountSelectProps {
  accounts: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  label?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  minWidth: number;
}

const MENU_GAP = 6;
const VIEWPORT_MARGIN = 12;
const MENU_WIDTH = 224;

export default function AccountSelect({
  accounts,
  value,
  onChange,
  includeAll = true,
  label,
}: AccountSelectProps) {
  const { t } = useI18n();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const open = position !== null;

  const options = [
    ...(includeAll ? [{ id: "all", text: t("All accounts") }] : []),
    ...accounts.map((account) => ({ id: account.id, text: `@${account.username}` })),
  ];
  const current = options.find((option) => option.id === value);
  const accessibleLabel = label ?? t("Instagram account");

  const close = useCallback((refocus = false) => {
    setPosition(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, MENU_WIDTH);
    // Open toward the side with room: leading-aligned, or trailing-aligned
    // when the button sits near the right edge.
    const fitsRight = rect.left + width <= window.innerWidth - VIEWPORT_MARGIN;
    const left = fitsRight ? rect.left : rect.right - width;
    setPosition({
      top: rect.bottom + MENU_GAP,
      left: Math.max(VIEWPORT_MARGIN, left),
      minWidth: rect.width,
    });
  }

  // Move focus into the menu (onto the checked item) once it opens.
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]");
    const checked = menuRef.current?.querySelector<HTMLButtonElement>("[aria-checked=true]");
    (checked ?? items?.[0])?.focus();
  }, [open]);

  // Dismiss on outside interaction, scroll and resize, like a real menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? []
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  function select(id: string) {
    close(true);
    if (id !== value) onChange(id);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && <span className="footnote px-1">{label}</span>}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label ? undefined : `${accessibleLabel}: ${current?.text ?? ""}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
        className={`inline-flex h-[34px] min-w-0 max-w-full items-center gap-2 rounded-full pl-3.5 pr-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--surface-2)_80%,var(--foreground)_8%)] ${
          open ? "bg-[color-mix(in_srgb,var(--surface-2)_80%,var(--foreground)_8%)]" : "bg-surface-2"
        }`}
      >
        <span className="truncate">{current?.text ?? accessibleLabel}</span>
        <ChevronsUpDown aria-hidden strokeWidth={1.9} className="size-3.5 shrink-0 text-muted" />
      </button>

      {position && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={accessibleLabel}
          onKeyDown={onMenuKeyDown}
          style={{ top: position.top, left: position.left, minWidth: Math.max(position.minWidth, MENU_WIDTH) }}
          className="popover fixed z-50 max-h-[min(360px,60vh)] max-w-[calc(100vw-24px)] overflow-y-auto p-1.5"
        >
          {options.map((option, index) => {
            const checked = option.id === value;
            return (
              <div key={option.id}>
                {includeAll && index === 1 && (
                  <div role="separator" className="mx-2.5 my-1 border-t-[0.5px] border-border-hover" />
                )}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  onClick={() => select(option.id)}
                  className="flex w-full items-center gap-2 rounded-[6px] py-1.5 pl-2 pr-3 text-left text-[14px] text-foreground outline-none hover:bg-accent hover:text-on-accent focus-visible:bg-accent focus-visible:text-on-accent"
                >
                  <Check
                    aria-hidden
                    strokeWidth={2.4}
                    className={`size-3.5 shrink-0 ${checked ? "" : "invisible"}`}
                  />
                  <span className="truncate">{option.text}</span>
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
