# Design (Stage 01)

Source of truth for the look of the site, with the Figma file ([`FIGMA_FILE_URL`](https://www.figma.com/design/7b6W4tsb9Ia0J0KhyvBWCX/Artemis-II---Site)). Tokens are Figma variables and CSS variables with the same names. Screens use placeholders, not NASA photos, and no NASA logo (`LEGAL-02`). Texts are placeholders and not final content. The Figma text is in English (the base language of the design); one Spanish screen checks that the layout holds in Spanish.

## Figma pages

| Page | Link |
| --- | --- |
| Foundations | [node 0:1](https://www.figma.com/design/7b6W4tsb9Ia0J0KhyvBWCX/Artemis-II---Site?node-id=0-1) |
| Components | [node 8:2](https://www.figma.com/design/7b6W4tsb9Ia0J0KhyvBWCX/Artemis-II---Site?node-id=8-2) |
| Screens | [node 8:3](https://www.figma.com/design/7b6W4tsb9Ia0J0KhyvBWCX/Artemis-II---Site?node-id=8-3) |
| Exploration | [node 8:4](https://www.figma.com/design/7b6W4tsb9Ia0J0KhyvBWCX/Artemis-II---Site?node-id=8-4) (empty: no alternatives were compared) |
| Archive | [node 8:5](https://www.figma.com/design/7b6W4tsb9Ia0J0KhyvBWCX/Artemis-II---Site?node-id=8-5) (empty: nothing rejected) |

## Tokens

Naming rule: the Figma variable `group/name` becomes the CSS variable `--group-name` (slashes become hyphens).

### Color (collection `Color`, modes `dark` default and `light`)

| Figma variable | CSS variable | dark | light |
| --- | --- | --- | --- |
| `color/background` | `--color-background` | `#0B0D12` | `#FAFAF7` |
| `color/surface` | `--color-surface` | `#151922` | `#EEEDE7` |
| `color/text` | `--color-text` | `#F2F4F8` | `#14171F` |
| `color/text-muted` | `--color-text-muted` | `#A9B1C0` | `#4A5263` |
| `color/accent` | `--color-accent` | `#7FB2FF` | `#1F5FBF` |
| `color/focus-ring` | `--color-focus-ring` | `#FFD166` | `#8A5A00` |
| `color/border` | `--color-border` | `#68728A` | `#707A8C` |

### Density (collection `Density`, modes `compact`, `comfortable` default, `spacious`)

| Figma variable | CSS variable | compact | comfortable | spacious |
| --- | --- | --- | --- | --- |
| `space/1` | `--space-1` | 4 | 4 | 6 |
| `space/2` | `--space-2` | 8 | 8 | 12 |
| `space/3` | `--space-3` | 12 | 16 | 20 |
| `space/4` | `--space-4` | 16 | 24 | 32 |
| `space/5` | `--space-5` | 24 | 40 | 56 |
| `space/6` | `--space-6` | 40 | 72 | 104 |
| `text/base` | `--text-base` | 15 | 16 | 18 |
| `layout/content-max` | `--layout-content-max` | 880 | 1040 | 1200 |

Values are px; code uses `rem` for sizes where it keeps the same ratio (16 px = 1 rem at the comfortable density).

### Type and shape (collection `Type`, one mode)

| Figma variable | CSS variable | Value |
| --- | --- | --- |
| `text/caption` | `--text-caption` | 13 |
| `text/label` | `--text-label` | 14 |
| `text/h3` | `--text-h3` | 20 |
| `text/h2` | `--text-h2` | 28 |
| `text/h1` | `--text-h1` | 40 |
| `radius/sm` | `--radius-sm` | 6 |
| `radius/md` | `--radius-md` | 12 |
| `font/display` | `--font-display` | Fraunces (headings and brand; Google Fonts, OFL) |
| `font/ui` | `--font-ui` | Inter (body and UI; Google Fonts, OFL) |

Headings use Fraunces SemiBold; body, labels and captions use Inter (Regular, Medium, Semi Bold). The font variables document the families; text nodes use the families directly because Figma cannot bind them to style names.

## Contrast (WCAG AA)

Ratios computed with the WCAG 2.x relative-luminance formula. Normal text needs 4.5:1; non-text UI (borders, focus ring) needs 3:1.

| Pair | Kind | dark | light |
| --- | --- | --- | --- |
| text on background | text | 17.65 | 17.13 |
| text on surface | text | 15.97 | 15.27 |
| text-muted on background | text | 9.01 | 7.50 |
| text-muted on surface | text | 8.15 | 6.68 |
| accent on background (links, active nav) | text | 8.99 | 5.83 |
| accent on surface | text | 8.14 | 5.19 |
| background on accent (primary button label, selected chip) | text | 8.99 | 5.83 |
| focus-ring on background | non-text | 13.48 | 5.67 |
| focus-ring on surface | non-text | 12.20 | 5.05 |
| border on background | non-text | 4.04 | 4.14 |
| border on surface | non-text | 3.65 | 3.69 |

All pairs pass. The dark `color/border` was raised from `#5A6478` during this stage because it was 2.96:1 on surface.

## Components (page Components)

| Component | Variants | Node |
| --- | --- | --- |
| Chip (selectable option) | `state=default`, `selected` | 10:6 |
| Button | `variant=primary`, `secondary`, `ghost` | 10:13 |
| Link | one | 10:14 |
| PreferencesPanel | theme, language, density (+ gallery view in the `/gallery` variant) | 10:16, 10:42 |
| ViewControl (gallery pages only) | one | 10:77 |
| TopBar | `device=desktop, state=closed` / `preferences`; `device=mobile, state=closed` / `menu` | 10:182 |
| Footer (credit, independence note, short AI notice) | `device=desktop`, `mobile` | 10:191 |
| PhotoCard | `view=mosaic`, `gallery`, `immersive` | 10:207 |
| TimelineItem | one | 10:208 |
| CrewCard | one | 10:215 |
| VideoPlaceholder (before click, loads nothing) | one | 10:220 |
| CreditLine | one | 10:226 |

Top bar and footer layout (changed after Stage 01, at Hugo's request): their content sits in the same centered column as the page content (`layout/content-max`, side padding `space/4`); the bar and footer backgrounds and borders still span the full width. On desktop the brand is on the left, the links are centered between the brand and the Settings button, and the button is bordered (surface fill, `color/border` outline). Links use `color/accent`, the current page in Semi Bold. The footer lines are all caption size: the credit and the "Learn more" link in `color/accent`, the rest in `color/text-muted`, with a top border.

Top bar behavior: one "Settings" (desktop) or "Menu" (mobile) button opens a panel with theme, language and density, so the controls never crowd the bar on a phone (`AC-6`). The gallery view control is a strip under the bar, shown only on gallery pages.

## Screens (page Screens, English, dark, comfortable; mobile 390 px and desktop 1440 px)

| Page | Mobile | Desktop |
| --- | --- | --- |
| Home | 11:2 | 11:41 |
| The launch | 11:85 | 11:154 |
| The mission | 11:228 | 11:312 |
| Why it matters | 11:403 | 11:424 |
| Gallery index | 11:453 | 11:498 |
| Chapter, Mosaic view | 11:547 | 11:608 |
| Chapter, Gallery view | 11:687 | 11:734 |
| Chapter, Immersive view | 11:797 | 11:833 |
| Photo | 11:877 | 11:911 |
| About | 11:953 | 11:978 |

Variations:

| Variation | Frames |
| --- | --- |
| Photo, light theme | 11:1011 (mobile), 11:1045 (desktop) |
| Home, light theme | 11:1087 (mobile), 11:1125 (desktop) |
| The mission, compact and spacious density (desktop) | 11:1168, 11:1258 |
| Home in Spanish, desktop (text length check) | 11:1349 |

Open a node with `https://www.figma.com/design/7b6W4tsb9Ia0J0KhyvBWCX/Artemis-II---Site?node-id=<id with : replaced by ->`.

## Known gaps

- On mobile, navigation links live in the menu panel (TopBar `device=mobile, state=menu`).
- Pages are shown as the closed top bar. The open preferences states are in the Components page.
- Layout shows the same content-width cap (`layout/content-max`) at every viewport; below it the content fills the screen with `space/4` side padding.
