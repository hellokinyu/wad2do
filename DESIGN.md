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
- **Auto**, **New Year**, **National Day**, **Halloween** and **Christmas** only change the navbar's decoration and follow the system setting for everything else.

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
| `--subtle`                           | `#686b7d`             | `#8d91a3`             | Hints, placeholders                           |
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
| `--photo-scrim`                      | 50% `#111219`         | same                  | Dark disc behind white icons on photos        |
| `--photo-scrim-strong`               | 66% `#111219`         | same                  | That disc on hover                            |

### Rules

1. **Never type a colour in a component.** Use a name from the table. If nothing fits, add a new name to `styles.css` with a light and a dark value, then add it here.
2. **Amber is for actions only.** It marks the one thing to tap: a primary button, the saved heart, the active nav icon. Don't use it for decoration.
3. **Amber is never text on a light background.** It's too pale to read. Fill a button or badge with `--accent` and put `--on-accent` text on it, or use `--accent-ink` for amber text.
4. **Selected states use ink.** A selected chip, tab or toggle is `background: var(--ink); color: var(--on-ink)`. This flips correctly in dark mode.
5. **White on photos stays white.** Buttons and labels drawn on top of photos (the heart and share icons, photo captions) keep literal `white`, because photos look the same in both modes. Icon buttons sit on a `--photo-scrim` disc so they stay readable on bright photos and on the grey no-photo placeholder.
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

## Corners

| Name            | Size  | Use it for                  |
| --------------- | ----- | --------------------------- |
| `--radius-xs`   | 6px   | Tiny swatches and tooltips  |
| `--radius-sm`   | 10px  | Small tiles, thumbnails     |
| `--radius-md`   | 14px  | Panels, inputs, inner boxes |
| `--radius-lg`   | 18px  | Cards                       |
| `--radius-xl`   | 22px  | Page heroes                 |
| `--radius-pill` | 999px | Buttons, chips, tags        |

Circles (avatars, round icon buttons) use `50%`. Don't type any other `border-radius` value.

## Shadows

| Name              | Use it for                         |
| ----------------- | ---------------------------------- |
| `--shadow-sm`     | Labels on photos, small popovers   |
| `--shadow-card`   | Cards at rest                      |
| `--shadow-raised` | Cards on hover, or anything lifted |
| `--shadow-float`  | Floating buttons and toasts        |
| `--shadow-dialog` | Dialogs and pop-up panels          |

They're stronger in dark mode, where faint shadows disappear.

## Focus

Every link, button and tabbable element gets the same keyboard focus ring from `styles.css`: a 2px ink outline. Don't write your own `:focus-visible` rule unless the control needs a different shape (for example the dashed outline on the MRT map). If you do, use `outline: var(--focus-ring)`.

The ring is ink, not amber, because amber is too faint against the light page for keyboard users to see.

Bootstrap's close button (`.btn-close`, the × in every pop-up) gets the same ink ring from `styles.css` instead of Bootstrap's blue glow, and only for the keyboard.

## Cards

For the standard card (hairline border, 18px corners, card background, soft shadow), add the `surface-card` class. Don't re-write those four lines:

```html
<article class="vote-card surface-card">…</article>
```

Your own class only adds what's different, like padding or a hover shadow:

```css
.vote-card {
  padding: 16px;
}

.vote-card:hover {
  box-shadow: var(--shadow-raised);
}
```

## Buttons

Use Bootstrap's buttons. Don't define your own button colours in a page.

| Button               | Classes                                           |
| -------------------- | ------------------------------------------------- |
| Primary (amber)      | `btn btn-dark rounded-pill px-4 py-2`             |
| Secondary (outlined) | `btn btn-outline-dark rounded-pill px-4 py-2`     |
| Small secondary      | `btn btn-outline-dark btn-sm rounded-pill px-3`   |
| Delete or remove     | `btn btn-outline-danger btn-sm rounded-pill px-3` |
| Large primary        | `btn btn-dark btn-lg rounded-pill px-4`           |

All buttons are semibold. When a `btn-outline-dark` is a selected `btn-check` toggle, it fills with ink.

## Pop-ups

Every pop-up uses [BaseDialog.vue](src/components/BaseDialog.vue). It handles Esc, clicking the dim area, keeping Tab inside, stopping the page behind from scrolling, and giving focus back to the button that opened it. Don't build a pop-up from a `<div>` or a bare `<dialog>`.

```vue
<BaseDialog v-model:open="showVoters" title="Who voted" class="voters-dialog">
  …content…
  <template #footer>…buttons…</template>
</BaseDialog>
```

- Set the width with `--dialog-width` on your class (default 460px).
- Use `:closable="!saving"` to stop it closing mid-request, and `flush` for edge-to-edge content like a photo.
- Use `:open` with `@close` instead of `v-model:open` when closing needs to run your own code.
- Focus the button that opens it before opening (`event.currentTarget.focus()`), because Safari doesn't focus buttons on click.

## Messages after an action

Short confirmations ("Saved to your Profile.") float at the bottom of the screen as an ink panel: `background: var(--ink)`, `color: var(--on-ink)`, `--shadow-float`, `--radius-md`. Errors use Bootstrap's danger colours instead. See `.save-feedback` in [ActivitiesView.vue](src/views/ActivitiesView.vue).

- A routine message fades after 4 seconds.
- A message with a next step (for example "Go vote in Saturday Squad" after sharing) stays until it's closed, because a link that vanishes can't be tapped.
- Its close button sends keyboard focus somewhere sensible (the results), since the button disappears with the message.

## Bootstrap

`styles.css` points Bootstrap's own variables at the theme, so these follow it with no extra work:

- **Text and surfaces:** `text-body`, `text-secondary`, `text-muted`, `bg-body`, `bg-body-secondary`, `border`.
- **Components:** form controls, checkboxes, radios and switches (amber when ticked), cards, modals, dropdowns and list groups, which all use the card background.

Avoid `bg-white`, `bg-light`, `bg-dark`, `text-dark`, `text-white` and `text-bg-light`. They don't change in dark mode. Use `bg-body`, `text-body` or a theme name instead. The exception is labels on photos.

## Where styles go

Each style lives in exactly one place:

1. **`src/assets/styles.css`**: the theme names (colours, corners, shadows, fonts, focus) and styles shared by many pages, like `surface-card`.
2. **Bootstrap classes**: buttons, forms, spacing and layout utilities.
3. **`<style scoped>` in a component**: only what's unique to that component, using the names above.

If you're about to copy a block of CSS from another file, it belongs in step 1 or 2 instead.

```css
.my-panel {
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--ink);
}

.my-panel .hint {
  color: var(--muted);
}

.my-chip.selected {
  background: var(--ink);
  color: var(--on-ink);
}
```

To check a page in dark mode, pick **Dark** in the navbar theme picker or add `?navTheme=dark` to the URL.
