# Craft in Action

How the subtle layering principle translates to real decisions. Learn the thinking, not the code. Your values will differ — the approach won't.

---

## The Subtle Layering Mindset

**You should barely notice the system working.**

When you look at Vercel's dashboard, you don't think "nice borders." You just understand the structure. When you look at Supabase, you don't think "good surface elevation." You just know what's above what. The craft is invisible — that's how you know it's working.

---

## Example: Dashboard with Sidebar and Dropdown

### Surface Decisions

Each elevation jump: only a few percentage points of lightness. Barely visible in isolation, but when surfaces stack, hierarchy emerges. Whisper-quiet shifts you feel rather than see.

**What NOT to do:** Don't make dramatic jumps between elevations. Don't use different hues for different levels. Keep the same hue, shift only lightness.

### Border Decisions

**Why rgba, not solid colors?** Low opacity borders blend with their background. A low-opacity white border on a dark surface is barely there — defines the edge without demanding attention. Solid hex borders look harsh in comparison.

**The test:** Look from arm's length. If borders are the first thing you notice, reduce opacity. If you can't find where regions end, increase slightly.

### Sidebar Decision

**Why same background as canvas?** Different sidebar color fragments visual space into "sidebar world" and "content world." Same background with subtle border separation means the sidebar is part of the app, not a separate region. Vercel and Supabase both do this.

### Dropdown Decision

**Why one level above parent?** If dropdown and card share the same surface level, the dropdown blends in — you lose the sense of layering. One step up is just enough to feel "above" without being dramatically different.

**Why slightly stronger borders on overlays?** Floating elements need slightly more definition. A touch more border opacity helps them feel contained without being harsh.

---

## Example: Form Controls

### Input Background

**Why darker, not lighter?** Inputs are "inset" — they receive content. A slightly darker background signals "type here" without heavy borders. This is the alternative-background principle.

### Focus State

**Why subtle?** Focus needs to be visible, but not glowing rings or dramatic color. A noticeable increase in border opacity is enough. Subtle-but-noticeable — same principle as surfaces.

---

## Adapt to Context

Your product might need warmer hues, cooler hues, different lightness progression, or light mode (principles invert — higher elevation = shadow, not lightness).

**The principle is constant:** barely different, still distinguishable. The values adapt.

---

## The Craft Check

1. Blur your eyes or step back
2. Can you still perceive hierarchy?
3. Is anything jumping out?
4. Can you tell where regions begin and end?

If hierarchy is visible and nothing is harsh — the subtle layering is working.

---

## System File Templates

### Precision & Density (dashboards, admin panels)

```markdown
# Design System

## Direction
Personality: Precision & Density
Foundation: Cool (slate)
Depth: Borders-only

## Tokens
### Spacing
Base: 4px
Scale: 4, 8, 12, 16, 24, 32

### Colors
--foreground: slate-900
--secondary: slate-600
--muted: slate-400
--faint: slate-200
--border: rgba(0, 0, 0, 0.08)
--accent: blue-600

### Radius
Scale: 4px, 6px, 8px (sharp, technical)

### Typography
Font: system-ui
Scale: 11, 12, 13, 14 (base), 16, 18
Weights: 400, 500, 600
Mono: SF Mono, Consolas

## Patterns
### Button
Height: 32px, Padding: 8px 12px, Radius: 4px, Font: 13px/500, Border: 1px solid

### Card
Border: 0.5px solid (faint), Padding: 12px, Radius: 6px, No shadow

### Table Cell
Padding: 8px 12px, Font: 13px tabular-nums, Border-bottom: 1px solid (faint)
```

### Warmth & Approachability (collaborative apps)

```markdown
# Design System

## Direction
Personality: Warmth & Approachability
Foundation: Warm (stone)
Depth: Subtle shadows

## Tokens
### Spacing
Base: 4px
Scale: 8, 12, 16, 24, 32, 48 (generous)

### Colors
--foreground: stone-900
--secondary: stone-600
--muted: stone-400
--faint: stone-200
--accent: orange-500
--shadow: 0 1px 3px rgba(0, 0, 0, 0.08)

### Radius
Scale: 8px, 12px, 16px (soft, friendly)

### Typography
Font: Inter
Scale: 13, 14, 15, 16 (base), 18, 20, 24
Weights: 400, 500, 600

## Patterns
### Button
Height: 40px, Padding: 12px 20px, Radius: 8px, Font: 15px/500, Shadow: subtle

### Card
Border: none, Padding: 20px, Radius: 12px, Shadow: 0 1px 3px rgba(0,0,0,0.08)

### Input
Height: 44px, Padding: 12px 16px, Radius: 8px, Border: 1.5px solid (faint)
```

### System File Template (blank)

```markdown
# Design System

## Direction
Personality: [Precision & Density | Warmth & Approachability | Sophistication & Trust | Boldness & Clarity | Utility & Function | Data & Analysis]
Foundation: [warm | cool | neutral | tinted]
Depth: [borders-only | subtle-shadows | layered-shadows]

## Tokens
### Spacing
Base: [4px | 8px]
Scale: [values]

### Colors
--foreground: [value]
--secondary: [value]
--muted: [value]
--faint: [value]
--accent: [value]

### Radius
Scale: [values]

### Typography
Font: [choice]
Scale: [values]
Weights: [values]

## Patterns
[Component patterns with specific measurements]

## Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
```
