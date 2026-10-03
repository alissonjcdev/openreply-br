# Design system (Apple / HIG style)

The dashboard follows Apple's Human Interface Guidelines as they look on macOS
System Settings, iOS Settings and apple.com account pages. Tokens and
primitives live in `app/globals.css`; icons come from `lucide-react`
(stand-in for SF Symbols, `strokeWidth={1.9}`, 16–18 px).

## Principles
- Grouped inset lists over cards. Content sits in white (dark: #1c1c1e) rounded
  groups (`.group`, radius 12) on the gray window background, rows separated by
  inset hairlines (`.group-row`). No borders around groups.
- Typography carries hierarchy: `.large-title` per page, `.title-3` for section
  titles, `.group-header` above a group (sentence case, never ALL CAPS),
  `.footnote` / `.caption` for secondary text, `.numeral` for big numbers.
- One tint: `accent` (systemBlue) for links, icons, primary buttons, selected
  states. Never use it as a large fill area or as a filled pill for nav.
- Status = colored text only (`text-success`, `text-error`, `text-warning`,
  `text-muted`). No badges with dots, no capsules, no ALL CAPS.
- No drop shadows, no gradients, no glow, no emojis. Depth comes from the
  background/surface contrast and from `.material` on bars and popovers.
- Avoid template-dashboard tells: rows of identical stat cards, icons inside
  colored circles/squares, monogram avatars in gradients, steppers with dots.
  Prefer one grouped container with metrics separated by hairlines, and
  asymmetric layouts.
- Motion: short, springy, fade/scale from 0.98; respect reduced motion.

## Primitives (app/globals.css)
| Class | Use |
|---|---|
| `.large-title` | Page title (28/34 px bold display) |
| `.title-2`, `.title-3` | Section / card titles |
| `.group-header`, `.group`, `.group-row`, `.group-footer` | Settings-style lists |
| `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-destructive` / `.btn-plain`, sizes `.btn-sm` `.btn-lg` | Capsule buttons |
| `.field` | Text input / textarea (filled, blue focus ring) |
| `.switch` (+ `aria-checked`) | iOS toggle, green when on |
| `.segmented` (children with `aria-checked` / `aria-selected` / `.active`) | Segmented control |
| `.material`, `.popover` | Translucent bars, menus, popovers |
| `.numeral` | Rounded tabular numerals for metrics |

Tokens: `bg-background` (window), `bg-surface` (cell), `bg-surface-2` (fill),
`bg-surface-hover`, `border-border` (separator), `text-muted` (secondary
label), `text-tertiary`, `text-accent` / `text-accent-text` (links),
`bg-accent-soft`, `text-success|error|warning`, `bg-switch-on`, `bg-overlay`.

Never use a native `<select>`: build a menu (button + `.popover` list) or a
`.segmented` control. Keep every existing `t()` key; add new copy to
`lib/i18n/pt-BR.json` and `lib/i18n/zh-TW.json` (same keys, the tests check).
