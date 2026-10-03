// Theme preference shared by the root layout's pre-paint script and the
// toggle. "system" means no data-theme attribute: CSS follows the OS.

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "openreply-theme";
export const THEME_COOKIE = "openreply-theme";
export const THEME_CHANGE_EVENT = "openreply-theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

// Runs in <head> before the body paints, so a saved light/dark choice never
// flashes the other palette. Reads localStorage first, then the cookie (for
// browsers that block storage). Kept dependency-free and tiny on purpose.
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(!t){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);t=m&&m[1]}if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
