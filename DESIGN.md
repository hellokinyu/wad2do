# Design

WAD2Do has one theme in two modes:

- **Brunch Club** (light, default): cool off-white page, white cards, near-black text.
- **Supper Club** (dark): blue-black page, slightly lighter cards, near-white text.

Both modes share the same fonts, shapes and colour meanings. Amber means "do this", teal means keen, coral means not keen. Activity photos supply the rest of the colour.

The colours live in one place: [src/assets/styles.css](src/assets/styles.css). Every page uses the names below instead of typing colours, so changing a value there changes the whole app in both modes.

## Light and dark

Dark mode is on when `<html>` has `data-bs-theme="dark"`. [src/lib/colorMode.js](src/lib/colorMode.js) sets it:

- By default it follows the phone or computer's own light/dark setting.
- Picking **Light** or **Dark** in the navbar theme picker overrides that for the rest of the browser tab.
- **Auto**, **Halloween** and **Christmas** only change the navbar's decoration and follow the system setting for everything else.

## Colours

| Name                                 | Light                 | Dark                  | Use it for                                    |
| ------------------------------------ | --------------------- | --------------------- | --------------------------------------------- |
| `--bg`                               | `#f5f6fa`             | `#111219`             | Page background                               |
| `--surface`                          | `#ffffff`             | `#1c1e28`             | Cards, dialogs, inputs                        |
| `--surface-2`                        | `#eceef4`             | `#262935`             | Soft panels, chips, hover                     |
| `--surface-3`                        | `#e1e4ec`             | `#31354a`             | Pressed or stronger grey fills                |
| `--ink`                              | `#111219`             | `#f2f2f5`             | Main text; selected chips, tabs and toggles   |
| `--ink-hover`                        | `#2a2d3a`             | `#d8d9e0`             | Hover on an `--ink` fill                      |
| `--on-ink`                           | `#ffffff`             | `#111219`             | Text on an `--ink` fill                       |
| `--muted`                            | `#5f6273`             | `#a3a6b4`             | Secondary text                                |
| `--subtle`                           | `#8a8d9c`             | `#7d8091`             | Hints, placeholders                           |
| `--line`                             | `#dfe1e9`             | `#2e3140`             | Hairlines, card borders                       |
| `--line-strong`                      | `#b9bdcb`             | `#4a4e60`             | Input borders, dashed borders                 |
| `--accent`                           | `#ffbe45`             | `#ffbe45`             | Primary buttons, saved heart, active nav icon |
| `--accent-hover` / `--accent-active` | `#ffb020` / `#f0a20c` | same                  | Hover and pressed amber                       |
| `--on-accent`                        | `#1a1206`             | `#1a1206`             | Text on amber                                 |
| `--accent-ink`                       | `#8f5b00`             | `#ffbe45`             | Amber-coloured **text**                       |
| `--accent-subtle`                    | `#fff1d3`             | `#3a2e14`             | Light amber background                        |
| `--keen` / `--on-keen`               | `#3fd9b5` / `#06221b` | same                  | Keen vote fill and its text                   |
| `--keen-ink` / `--keen-subtle`       | `#0b7a62` / `#d9f7ef` | `#3fd9b5` / `#12352e` | Keen text and soft background                 |
| `--nope`                             | `#ff6b7f`             | `#ff6b7f`             | Not keen fill or bar                          |
| `--nope-ink` / `--nope-subtle`       | `#b42335` / `#ffe3e7` | `#ff8a99` / `#3a1a22` | Not keen text and soft background             |
| `--overlay`                          | 45% `#111219`         | 60% black             | Behind dialogs                                |

### Rules

1. **Never type a colour in a component.** Use a name from the table. If nothing fits, add a new name to `styles.css` with a light and a dark value, then add it here.
2. **Amber is for actions only.** It marks the one thing to tap: a primary button, the saved heart, the active nav icon. Don't use it for decoration.
3. **Amber is never text on a light background.** It's too pale to read. Fill a button or badge with `--accent` and put `--on-accent` text on it, or use `--accent-ink` for amber text.
4. **Selected states use ink.** A selected chip, tab or toggle is `background: var(--ink); color: var(--on-ink)`. This flips correctly in dark mode.
5. **White on photos stays white.** Buttons and labels drawn on top of photos (the heart and share icons, photo captions) keep literal `white`, because photos look the same in both modes.
6. **Colours that mean something stay as they are**, in both modes:
   - Group stage colours (Voting amber, Time picked blue, Planned green, past grey) in `src/lib/groupDisplay.js`
   - The availability heatmap greens in `GroupAvailabilityTab.vue`
   - Errors and delete buttons (Bootstrap's `danger` colours)
   - The MRT map blue in `MrtStationPicker.vue`
   - Illustrations: animal avatars, the onboarding mascot, admin action icons, seasonal navbar art

## Type

| Role            | Font                                                 | Where                                                   |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Headings        | Bricolage Grotesque, 600–800, letter-spacing −0.02em | `h1`–`h6`, `.h1`–`.h6`, `.display-*` (set globally)     |
| Everything else | Manrope, 400–800                                     | Body text, buttons, forms (via `--bs-body-font-family`) |

Both are loaded from Google Fonts in [index.html](index.html). Use `var(--font-display)` or `var(--font-body)` if you need to set a font yourself. Don't set `font-family` to anything else.

## Bootstrap

`styles.css` points Bootstrap's own variables at the theme, so these follow it with no extra work:

- **`btn-dark`** is the amber primary button. Use it for the main action on a screen.
- **`btn-outline-dark`** is the secondary button. It's outlined, and filled with ink when it's a selected `btn-check` toggle.
- **Text and surfaces:** `text-body`, `text-secondary`, `text-muted`, `bg-body`, `bg-body-secondary`, `border`.
- **Components:** form controls, checkboxes, radios and switches (amber when ticked), cards, modals, dropdowns.

Avoid `bg-white`, `bg-light`, `bg-dark`, `text-dark`, `text-white` and `text-bg-light`. They don't change in dark mode. Use `bg-body`, `text-body` or a theme name instead. The exception is labels on photos.

## Using it in a component

```css
.my-card {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}

.my-card .hint {
  color: var(--muted);
}

.my-chip.selected {
  background: var(--ink);
  color: var(--on-ink);
}
```

To check a page in dark mode, pick **Dark** in the navbar theme picker or add `?navTheme=dark` to the URL.
