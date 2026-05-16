# Kuber — Brand Guidelines

> Personal finance, self-hosted. Calm, precise, trustworthy.

---

## 1. Brand Essence

**What Kuber is:** A personal finance platform that gives users total ownership of their financial data. No bank integrations that fail silently. No subscriptions. No surveillance.

**Tone:** Confident but unobtrusive. The app should feel like a well-designed tool — present when needed, invisible when not.

**Personality traits:**
- Precise (numbers are sacred, formatting is exact)
- Calm (no panic-inducing UI, no red everywhere)
- Honest (show what's real, even if it's uncomfortable)
- Modern but not trendy (will still look good in 5 years)

---

## 2. Logo & Wordmark

**Icon:** Coins (`lucide-react` → `Coins`) in accent orange  
**Wordmark:** "Kuber" in `font-display` (Tomorrow), weight 700  
**Lockup:** Icon left, wordmark right, gap `0.5rem`

```
⬡ Kuber
```

**Don't:**
- Stretch or distort the lockup
- Use the wordmark without the icon in app contexts
- Render the wordmark in any color other than `--color-text` (dark) or `--color-text-inverse` (on dark backgrounds)

---

## 3. Color System

### 3.1 Brand Accent (Default: Orange)

| Token                  | Value     | Use                                      |
|------------------------|-----------|------------------------------------------|
| `--color-accent`       | `#E5622A` | CTAs, active nav, focus rings, key data  |
| `--color-accent-hover` | `#C84F17` | Hover state on accent elements           |
| `--color-accent-light` | `#FDF0EC` | Active nav background, tinted surfaces   |
| `--color-on-accent`    | `#FFFFFF` | Text/icons placed on accent backgrounds  |

The app ships with 6 selectable accent themes. All share the same token names — never hardcode hex values.

| Name    | Accent    | Notes                        |
|---------|-----------|------------------------------|
| Orange  | `#E5622A` | Default                      |
| Green   | `#1B7A4F` | Finance-safe, conservative   |
| Ink     | `#111827` | Near-black, minimal          |
| Indigo  | `#3730A3` | Professional, trustworthy    |
| Teal    | `#0E9594` | Fresh, analytical            |
| Lime    | `#C6F24C` | High-contrast, energetic     |

### 3.2 Surface Scale (Light Mode)

| Token                       | Value     | Use                              |
|-----------------------------|-----------|----------------------------------|
| `--color-bg`                | `#F8F9FA` | Page background                  |
| `--color-surface`           | `#FFFFFF` | Card, sidebar, header            |
| `--color-surface-alt`       | `#F1F3F5` | Tab pills, segment controls      |
| `--color-surface-elevated`  | `#FFFFFF` | Modals, dropdowns (+ shadow)     |
| `--color-surface-hover`     | `#F1F3F5` | Hover state on interactive items |
| `--color-border`            | `#E9ECEF` | Default dividers, card edges     |
| `--color-border-strong`     | `#CED4DA` | Inputs, emphasized separators    |

### 3.3 Text Scale

| Token                      | Value     | Use                       |
|----------------------------|-----------|---------------------------|
| `--color-text`             | `#212529` | Primary body text         |
| `--color-text-secondary`   | `#6C757D` | Labels, nav items         |
| `--color-text-muted`       | `#868E96` | Timestamps, helper text   |
| `--color-text-inverse`     | `#FFFFFF` | Text on dark/accent fills |

### 3.4 Semantic Colors

| Token                    | Value     | Use                              |
|--------------------------|-----------|----------------------------------|
| `--color-success`        | `#2F9E44` | Positive amounts, on-track goals |
| `--color-success-light`  | `#EBFBEE` | Success badge backgrounds        |
| `--color-danger`         | `#E03131` | Errors, over-budget, negative    |
| `--color-danger-light`   | `#FFF5F5` | Error badge backgrounds          |
| `--color-warning`        | `#E67700` | At-risk, near-limit              |
| `--color-warning-light`  | `#FFF3BF` | Warning badge backgrounds        |
| `--color-info`           | `#1971C2` | Informational, neutral data      |
| `--color-info-light`     | `#E7F5FF` | Info badge backgrounds           |

### 3.5 Chart Palette

Use in order. Never mix with semantic colors.

| Slot              | Value     |
|-------------------|-----------|
| `--color-chart-1` | `#E5622A` |
| `--color-chart-2` | `#2F9E44` |
| `--color-chart-3` | `#1971C2` |
| `--color-chart-4` | `#9C36B5` |
| `--color-chart-5` | `#E67700` |
| `--color-chart-6` | `#0C8599` |

### 3.6 Dark Mode

Dark mode overrides surface and text tokens via `[data-theme="dark"]`. All accent colors remain unchanged. Always use CSS tokens — never hardcode hex values — so dark mode works automatically.

Key dark values:
- Background: `#0D0F10` — near-black, not pure black
- Surface: `#1A1D1E`
- Border: `#2F3438`

---

## 4. Typography

### 4.1 Font Stack

| Role      | Font         | Fallback                                     | Use                          |
|-----------|--------------|----------------------------------------------|------------------------------|
| Display   | **Tomorrow** | Inter, system-ui                             | KPI values, logo, hero text  |
| Body      | **Inter**    | -apple-system, BlinkMacSystemFont, Segoe UI  | All UI text, labels, body    |
| Mono      | **Fira Code**| ui-monospace, SFMono, Menlo, Consolas        | Amounts, account numbers     |

All fonts are self-hosted under `client/public/fonts/`. No Google Fonts in production.

### 4.2 Type Scale

| Class              | Size       | Weight | Use                               |
|--------------------|------------|--------|-----------------------------------|
| `.kpi-value`       | 2.25rem    | 700    | Net worth, primary KPIs (Tomorrow)|
| `.kb-display`      | 2rem       | 800    | Page heroes (Tomorrow, accent)    |
| `.kb-h1`           | 1.5rem     | 700    | Page titles                       |
| `.kb-h2`           | 1.125rem   | 600    | Section headers, card titles      |
| `.kb-h3`           | 0.875rem   | 600    | Widget sub-headers                |
| `.kb-eyebrow`      | 0.75rem    | 600    | Section labels, uppercase caps    |
| `.kb-body`         | 0.875rem   | 400    | Body text, descriptions           |
| `.kb-body-sm`      | 0.8125rem  | 400    | Secondary body, captions          |
| `.kb-meta`         | 0.75rem    | 400    | Timestamps, helper text           |
| `.widget-label`    | 0.75rem    | 500    | Widget header labels (uppercase)  |
| `.widget-stat`     | 1.5rem     | 700    | Secondary stat values             |
| `.transaction-amount` | 0.875rem | 400   | Transaction amounts (Fira Code)   |

### 4.3 Rules

- Financial amounts always use `font-variant-numeric: tabular-nums` to prevent layout shift
- Never use font sizes below 11px (0.6875rem)
- Tomorrow is reserved for display-weight numbers only — do not use for body copy
- Line height for body text: 1.5. For headings: 1.1–1.3.

---

## 5. Spacing & Layout

### 5.1 Scale

Follow an 8px base grid. Common values:

| Tailwind   | px    | Use                               |
|------------|-------|-----------------------------------|
| `gap-1`    | 4px   | Tight icon+label pairs            |
| `gap-2`    | 8px   | Form field rows, inline items     |
| `gap-3`    | 12px  | List items, nav rows              |
| `gap-4`    | 16px  | Card internal sections            |
| `gap-6`    | 24px  | Card padding (`p-6`), widget gaps |
| `gap-8`    | 32px  | Section separations               |

### 5.2 Card Padding

| Variant         | Class  | Use                         |
|-----------------|--------|-----------------------------|
| `padding="sm"`  | `p-3`  | Compact widgets, dense lists|
| `padding="md"`  | `p-4`  | Default card content        |
| `padding="lg"`  | `p-6`  | Dashboard widgets, primary  |

### 5.3 Page Layout

- Main content padding: `p-4` mobile → `p-6` desktop
- Dashboard grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Max content width: none — full-bleed within the main column

---

## 6. Border Radius

| Token            | Value        | Use                              |
|------------------|--------------|----------------------------------|
| `--radius-sm`    | 0.375rem (6px)  | Badges, pills, small chips    |
| `--radius-md`    | 0.5rem (8px)    | Buttons, inputs, nav items    |
| `--radius-lg`    | 0.75rem (12px)  | Cards, modals, popovers       |
| `--radius-xl`    | 1rem (16px)     | Large modals, sheets          |
| `--radius-full`  | 9999px          | Avatars, status dots, tags    |

Never mix radius scales within a single component.

---

## 7. Shadows

| Token          | Value                              | Use                         |
|----------------|------------------------------------|-----------------------------|
| `--shadow-sm`  | `0 1px 3px rgba(0,0,0,0.08)`       | Cards (resting state)       |
| `--shadow-md`  | `0 4px 12px rgba(0,0,0,0.08)`      | Hover states, dropdowns     |
| `--shadow-lg`  | `0 8px 24px rgba(0,0,0,0.12)`      | Modals, drawers             |

Dark mode shadows use higher opacity (~0.5) to remain visible on dark surfaces.

---

## 8. Navigation

### 8.1 Sidebar Structure

The sidebar groups navigation into five semantic sections:

| Group        | Items                                          |
|--------------|------------------------------------------------|
| Overview     | Dashboard                                      |
| Money        | Accounts, Transactions, AI Review, Import      |
| Insights     | Cash Flow, Reports, Wealth, Investments        |
| Planning     | Budget, Recurring, Goals                       |
| Automation   | Rules                                          |

Section labels use `.nav-section-label` (0.6875rem, uppercase, muted). Labels are hidden in the collapsed (icon-only) state.

### 8.2 Active State

Active nav items receive:
- `bg-[var(--color-accent-light)]` — tinted background
- `text-[var(--color-accent)]` — accent text + icon color
- `nav-item-active::before` — 2px accent left-border pill at 55% height

Inactive items: `text-[var(--color-text-secondary)]`, hover → `bg-[var(--color-surface-hover)]`

---

## 9. Components

### 9.1 Button

| Variant     | Use                                      |
|-------------|------------------------------------------|
| `primary`   | Main CTA — accent fill, white text       |
| `secondary` | Secondary actions — surface + border     |
| `ghost`     | Toolbar actions, inline links            |
| `outline`   | Toggle-style, secondary CTA              |
| `danger`    | Destructive actions — always confirm     |

Sizes: `sm` (12px text), `md` (14px, default), `lg` (16px)

### 9.2 Badge

Use semantic colors only: `success`, `warning`, `danger`, `info`, `default`.  
Never use raw hex for badge colors.

### 9.3 Card

All content surfaces use `<Card>`. Three layers of elevation:
1. **Resting:** `bg-surface`, `shadow-sm`, `border`
2. **Hoverable:** `shadow-md` on hover (for clickable cards)
3. **Elevated (modal context):** `bg-surface-elevated`

### 9.4 Empty States

Every list/table must have an `<EmptyState>` when data is absent.  
Required props: `title` + `description`. Optional: `action` button.

### 9.5 Skeleton Loaders

Use `<Skeleton>` while data is loading. Never show a blank card.  
Match skeleton dimensions to the actual rendered element.

---

## 10. Motion

| Pattern             | Duration | Easing      | Use                        |
|---------------------|----------|-------------|----------------------------|
| Page enter          | 180ms    | ease-out    | Route transitions (fade+translateY 6px) |
| Interactive hover   | 150ms    | ease        | Color/shadow transitions   |
| Sidebar collapse    | 200ms    | ease        | Width transition           |
| Bottom sheet        | 250ms    | ease-out    | Slide up from bottom       |
| Skeleton pulse      | 1500ms   | ease-in-out | Opacity 1→0.5→1 loop       |

Always respect `prefers-reduced-motion: reduce` — all animations disabled.

---

## 11. Accessibility

- Focus ring: 2px solid `--color-accent`, offset 2px, on all interactive elements
- Minimum touch target: 44×44px on mobile (enforced via `.icon-btn::after` pseudo-element)
- Contrast: all text must meet WCAG 2.2 AA (4.5:1 normal, 3:1 large)
- Sidebar on mobile: rendered as ARIA dialog with focus trap and Escape to close
- Charts: wrapped in `role="img"` + `aria-label` describing the data
- Semantic HTML: `<nav>`, `<main>`, `<aside>`, `<header>` used structurally

---

## 12. Writing Style

- **Labels:** Sentence case. Never title case on buttons or nav items except proper nouns.
- **Amounts:** Always show currency symbol. Negative amounts in `--color-danger`. Never show `-$` → show `–$` (en-dash).
- **Dates:** `MMM D` for short (e.g. "May 15"). `MMM D, YYYY` when year context needed.
- **Empty state copy:** Helpful, not apologetic. "No transactions yet" not "Oops, nothing here."
- **Error messages:** Specific. "Email already registered" not "Something went wrong."
- **Loading:** Don't say "Loading…" — let the skeleton speak for itself.
