# Core Craft Principles

These apply regardless of design direction. This is the quality floor.

---

## Surface & Token Architecture

Professional interfaces don't pick colors randomly — they build systems. Understanding this architecture is the difference between "looks okay" and "feels like a real product."

### The Primitive Foundation

Every color in your interface should trace back to a small set of primitives:

- **Foreground** — text colors (primary, secondary, muted)
- **Background** — surface colors (base, elevated, overlay)
- **Border** — edge colors (default, subtle, strong)
- **Brand** — your primary accent
- **Semantic** — functional colors (destructive, warning, success)

Don't invent new colors. Map everything to these primitives.

### Surface Elevation Hierarchy

Surfaces stack. A dropdown sits above a card which sits above the page. Build a numbered system:

```
Level 0: Base background (the app canvas)
Level 1: Cards, panels (same visual plane as base)
Level 2: Dropdowns, popovers (floating above)
Level 3: Nested dropdowns, stacked overlays
Level 4: Highest elevation (rare)
```

In dark mode, higher elevation = slightly lighter. In light mode, higher elevation = slightly lighter or uses shadow. The principle: **elevated surfaces need visual distinction from what's beneath them.**

### The Subtlety Principle

Study Vercel, Supabase, Linear — their surfaces are **barely different** but still distinguishable. Their borders are **light but not invisible**.

**For surfaces:** The difference between elevation levels should be subtle — a few percentage points of lightness. In dark mode, surface-100 might be 7% lighter than base, surface-200 might be 9%, surface-300 might be 12%.

**For borders:** Use low opacity (0.05-0.12 alpha for dark mode, slightly higher for light). The border should disappear when you're not looking for it, but be findable when you need structure.

**The test:** Squint at your interface. You should still perceive hierarchy. But no single border or surface should jump out. If borders are the first thing you notice, they're too strong. If you can't find where regions end, they're too subtle.

**Common mistakes to avoid:**
- Borders too visible (1px solid gray instead of subtle rgba)
- Surface jumps too dramatic (dark to light instead of dark to slightly-less-dark)
- Different hues for different surfaces (gray card on blue background)
- Harsh dividers where subtle borders would do

### Text Hierarchy via Tokens

Build four levels:

- **Primary** — default text, highest contrast
- **Secondary** — supporting text, slightly muted
- **Tertiary** — metadata, timestamps, less important
- **Muted** — disabled, placeholder, lowest contrast

Use all four consistently. If you're only using two, your hierarchy is too flat.

### Border Progression

Build a scale:

- **Default** — standard borders
- **Subtle/Muted** — softer separation
- **Strong** — emphasis, hover states
- **Stronger** — maximum emphasis, focus rings

Match border intensity to the importance of the boundary.

### Dedicated Control Tokens

Form controls have specific needs. Create dedicated tokens:

- **Control background** — often different from surface backgrounds
- **Control border** — needs to feel interactive
- **Control focus** — clear focus indication

### Alternative Backgrounds for Depth

Beyond shadows, use contrasting backgrounds for depth. An "alternative" or "inset" background makes content feel recessed. Useful for empty states, code blocks, inset panels, visual grouping without borders.

---

## Spacing System

Pick a base unit (4px or 8px) and use multiples throughout. Every spacing value should be explainable as "X times the base unit."

Build a scale:
- Micro spacing (icon gaps, tight element pairs)
- Component spacing (within buttons, inputs, cards)
- Section spacing (between related groups)
- Major separation (between distinct sections)

## Symmetrical Padding

TLBR must match. If top padding is 16px, left/bottom/right must also be 16px. Exception: when content naturally creates visual balance.

```css
/* Good */
padding: 16px;
padding: 12px 16px; /* Only when horizontal needs more room */

/* Bad */
padding: 24px 16px 12px 16px;
```

## Border Radius Consistency

Sharper = technical, rounder = friendly. Have a system: small for inputs/buttons, medium for cards, large for modals. Don't mix sharp and soft randomly.

## Depth & Elevation Strategy

Choose ONE and commit:

**Borders-only (flat):**
```css
--border: rgba(0, 0, 0, 0.08);
--border-subtle: rgba(0, 0, 0, 0.05);
border: 0.5px solid var(--border);
```

**Single shadow:**
```css
--shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
```

**Layered shadow:**
```css
--shadow-layered:
  0 0 0 0.5px rgba(0, 0, 0, 0.05),
  0 1px 2px rgba(0, 0, 0, 0.04),
  0 2px 4px rgba(0, 0, 0, 0.03),
  0 4px 8px rgba(0, 0, 0, 0.02);
```

## Card Layouts

Design each card's internal structure for its specific content. Keep surface treatment consistent: same border weight, shadow depth, corner radius, padding scale, typography.

## Isolated Controls

**Never use native form elements for styled UI.** Native `<select>`, `<input type="date">` render OS-native elements that cannot be styled. Build custom components:

- Custom select: trigger button + positioned dropdown menu
- Custom date picker: input + calendar popover
- Custom checkbox/radio: styled div with state management

Custom select triggers must use `display: inline-flex` with `white-space: nowrap`.

## Typography Hierarchy

- **Headlines** — heavier weight, tighter letter-spacing
- **Body** — comfortable weight for readability
- **Labels/UI** — medium weight, works at smaller sizes
- **Data** — monospace, `tabular-nums` for alignment

Don't rely on size alone. Combine size, weight, and letter-spacing.

## Iconography

Icons clarify, not decorate — if removing loses no meaning, remove it. Choose one icon set, stick with it. Give standalone icons subtle background containers.

## Animation

Micro-interactions ~150ms. Larger transitions 200-250ms. Smooth deceleration easing. Avoid spring/bounce in professional interfaces.

## Navigation Context

Include navigation, location indicators, user context. When building sidebars, consider same background as main content with border separation.

## Dark Mode

- **Borders over shadows** — shadows less visible on dark backgrounds
- **Adjust semantic colors** — desaturate status colors slightly
- **Same structure, different values** — hierarchy system still applies
