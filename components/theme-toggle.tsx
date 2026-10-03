"use client";

import { useId, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/provider";
import {
  THEME_CHANGE_EVENT,
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string }>;

// The <html data-theme> attribute is the source of truth: the pre-paint
// script in the root layout sets it from the saved choice.
function readTheme(): ThemePreference {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function saveTheme(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode, site data off): the cookie still works.
  }
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  // Another tab changed the theme: follow it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(isThemePreference(event.newValue) ? event.newValue : "system");
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export default function ThemeToggle() {
  const { t } = useI18n();
  // The sidebar and the settings page can both render a toggle at once.
  const labelId = useId();
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system");

  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-sm text-muted">
        {t("Theme")}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-3 rounded border border-border bg-background p-0.5"
      >
        {OPTIONS.map((option) => {
          const selected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => saveTheme(option.value)}
              className={`min-h-8 truncate rounded-sm px-2 text-xs ${
                selected
                  ? "bg-surface-hover font-medium text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t(option.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
