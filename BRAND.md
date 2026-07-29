# Bronze Direct — Brand Guide

Reference for building web pages and internal tools for Bronze Direct (Ireland).
Give this file to Claude at the start of a conversation to get consistent output.

---

## 1. Palette

The palette is derived directly from the logo gradient. Everything else supports it.

| Token | Hex | Role |
|---|---|---|
| `--plum` | `#531E52` | Gradient start. Deep, desaturated purple. |
| `--magenta` | `#B24C96` | Gradient end. The single bright accent. |
| `--ink` | `#150A15` | Page background base. Near-black with a purple bias. |
| `--ink-raised` | `#1F0F1E` | Cards, panels, raised surfaces. |
| `--cream` | `#F4EBF2` | Primary text. Warm off-white, never pure `#FFF`. |
| `--muted` | `#9C7C97` | Secondary text, labels, captions. |
| `--faint` | `#5C455A` | Tertiary text, footers, disabled states. |
| `--line` | `#332032` | Borders and dividers. |

### Rules

- **The gradient is the brand.** `linear-gradient(90deg, #531E52, #B24C96)` — always left to right, always in that order. Use it on the logo, one headline element per page, and horizontal rules. Not on buttons and headlines and cards all at once.
- **Dark is the default.** Backgrounds are `--ink`, not white. If a light surface is unavoidable (printable documents, invoices), use `#FAF6F9` with `#2A1529` text.
- **No pure black, no pure white.** Every neutral carries a purple undertone.
- **Never introduce bronze, gold, or orange.** The company name is misleading — the brand is purple/magenta.
- Ambient glow around the logo: `filter: drop-shadow(0 0 30px rgba(178,76,150,.35))`. Use sparingly, on the logo only.

---

## 2. Typography

**Archivo** for everything. It is a grotesque with a slightly condensed, industrial feel that suits a trade-supply business, and it holds up at both display and UI sizes — so no second face is needed.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&display=swap" rel="stylesheet">
```

```css
font-family: 'Archivo', system-ui, -apple-system, sans-serif;
```

### Scale

| Role | Size | Weight | Letter-spacing | Notes |
|---|---|---|---|---|
| Display | `clamp(2rem, 5.6vw, 4.4rem)` | 600 | `-0.02em` | Line-height `1.06`. Tight tracking is what makes it feel designed. |
| Section heading | `clamp(1.3rem, 2.6vw, 1.9rem)` | 600 | `-0.01em` | |
| Body | `1rem` / `1.05rem` | 400 | `0` | Line-height `1.6`. |
| Label / eyebrow | `0.9rem` | 500 | `0.2em` | UPPERCASE, colour `--muted`. |
| Micro | `0.7rem` | 500 | `0.24em` | UPPERCASE, colour `--faint`. Footers, timestamps. |

### Rules

- **Only three weights: 400, 500, 600.** No 700+, no italics.
- **Large type gets negative tracking, small type gets positive.** Display at `-0.02em`; uppercase labels at `0.2em`. This contrast is the core of the type system — don't flatten it.
- **Uppercase is reserved for labels.** Never set body copy or long headlines in caps.
- Constrain measure: headlines `max-width: 18ch`, body `max-width: 65ch`.

### Gradient text

Apply to one element per page, usually the brand name inside a headline:

```css
.accent{
  background: linear-gradient(90deg, var(--plum), var(--magenta));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

---

## 3. Logo

File: `logobd.svg` — a wordmark, 280 × 31, aspect ratio ~9:1.

- **Wordmark only.** There is no separate icon or symbol mark. Don't invent one.
- The gradient runs across the *whole wordmark*, so each letter picks up a different point on the ramp. If you rebuild or rescale it, keep `gradientUnits="userSpaceOnUse"` with `x1="0" x2="279.382"` — switching to per-letter gradients breaks the effect.
- The source file ships with 12 identical `<linearGradient>` definitions, one per letter. Collapsing them to a single `id="bdGrad"` is safe and cuts the file roughly in half.
- Sizing: `width: min(300px, 72vw); height: auto`. Never set a fixed height.
- Clear space on all sides: at least the cap height of the wordmark.
- Do not recolour, outline, rotate, add a drop shadow other than the ambient glow above, or place it on a mid-tone background where the plum end disappears.

---

## 4. Layout

- **Centred, generous, single-column** for landing and hero pages. Vertically centred with `min-height: 100vh`.
- Spacing rhythm: `8 / 16 / 24 / 44 / 80px`. The `44px` gap between major stacked blocks is the signature interval.
- Page padding: `8vh 24px`.
- Divider: a 140px hairline that fades at both ends, not a full-width border.

```css
.rule{
  width: 140px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--magenta), transparent);
}
```

- Corner radius: `4px` for inputs and buttons, `10px` for cards. Nothing fully rounded, nothing perfectly square.
- Data-dense screens (order lists, stock tables) drop the centring and go full-width, but keep the palette, type scale, and `--line` borders.

---

## 5. Motion

Restrained. The brand is a wholesaler, not a nightclub.

- Transitions: `160ms ease-out` on hover and focus. Nothing longer than `300ms`.
- One page-load fade-in on the hero stack is acceptable. No scroll-triggered reveals, no parallax, no animated gradients.
- Always honour `@media (prefers-reduced-motion: reduce)`.

---

## 6. Voice

- **Plain and direct.** Trade audience — salon owners and buyers who want the spec and the price.
- Sentence case in UI. Active voice on every control: "Place order", not "Submit".
- A control keeps its name through the whole flow: a button that says "Publish" produces a message that says "Published".
- Errors state what happened and what to do next. They don't apologise and they're never vague.
- Avoid superlatives in interface copy. Marketing claims like "best sunbed wholesaler in the world" belong in a hero headline, not in a button or a table header.

---

## 7. Copy-paste token block

```css
:root{
  --plum:#531E52;
  --magenta:#B24C96;
  --ink:#150A15;
  --ink-raised:#1F0F1E;
  --cream:#F4EBF2;
  --muted:#9C7C97;
  --faint:#5C455A;
  --line:#332032;

  --grad: linear-gradient(90deg, var(--plum), var(--magenta));
  --bg: radial-gradient(110% 70% at 50% 0%, #2E1330 0%, var(--ink) 58%, #0B050B 100%);

  --font: 'Archivo', system-ui, -apple-system, sans-serif;
  --ease: 160ms ease-out;
}

body{
  background: var(--bg);
  color: var(--cream);
  font-family: var(--font);
}
```

---

## 8. Quick checklist

- [ ] Background is dark plum, not white or grey
- [ ] Gradient appears on the logo plus at most one other element
- [ ] Archivo loaded, weights limited to 400/500/600
- [ ] Display type has negative tracking; uppercase labels have `0.2em`
- [ ] Logo is the unmodified wordmark, `height: auto`
- [ ] No bronze, gold, or orange anywhere
- [ ] Responsive to 360px; visible keyboard focus; reduced motion respected
