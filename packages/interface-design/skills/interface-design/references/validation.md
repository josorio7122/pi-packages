# Memory Management

When and how to update `.interface-design/system.md`.

---

## When to Add Patterns

Add to system.md when:
- Component used 2+ times
- Pattern is reusable across the project
- Has specific measurements worth remembering

## Pattern Format

```markdown
### Button Primary
- Height: 36px
- Padding: 12px 16px
- Radius: 6px
- Font: 14px, 500 weight
```

## Don't Document

- One-off components
- Temporary experiments
- Variations better handled with props

## Pattern Reuse

Before creating a component, check system.md:
- Pattern exists? Use it.
- Need variation? Extend, don't create new.

Memory compounds: each pattern saved makes future work faster and more consistent.

---

# Validation Checks

If system.md defines specific values, check consistency:

**Spacing** — All values multiples of the defined base?

**Depth** — Using the declared strategy throughout? (borders-only means no shadows)

**Colors** — Using defined palette, not random hex codes?

**Patterns** — Reusing documented patterns instead of creating new?

---

# Audit Process

Check existing code against the design system:

## What to Check

**If `.interface-design/system.md` exists:**

1. **Spacing violations** — values not on defined grid (e.g. 17px when base is 4px)
2. **Depth violations** — borders-only system with shadows, subtle system with layered shadows (allow ring shadows)
3. **Color violations** — colors not in defined palette (allow semantic grays)
4. **Pattern drift** — buttons/cards not matching documented patterns

**Report format:**
```
Audit Results: src/components/

Violations:
  Button.tsx:12 - Height 38px (pattern: 36px)
  Card.tsx:8 - Shadow used (system: borders-only)
  Input.tsx:20 - Spacing 14px (grid: 4px, nearest: 12px or 16px)

Suggestions:
  - Update Button height to match pattern
  - Replace shadow with border
  - Adjust spacing to grid
```

---

# Extract Process

Extract design patterns from existing code to create a system:

## What to Extract

Scan UI files (tsx, jsx, vue, svelte) for:

1. **Repeated spacing values** — frequency analysis → suggest base and scale
2. **Repeated radius values** — → suggest radius scale
3. **Button patterns** — height, padding consistency across instances
4. **Card patterns** — border, padding, shadow consistency
5. **Depth strategy** — ratio of box-shadow vs border usage

**Then propose:**
```
Extracted patterns:

Spacing: Base 4px, Scale: 4, 8, 12, 16, 24, 32
Depth: Borders-only (34 borders, 2 shadows)
Patterns:
  Button: 36px h, 12px 16px pad, 6px radius
  Card: 1px border, 16px pad

Create .interface-design/system.md with these? (y/n/customize)
```

---

# Design Directions Reference

| Direction | Feel | Best For |
|-----------|------|----------|
| **Precision & Density** | Tight, technical, monochrome | Developer tools, admin dashboards |
| **Warmth & Approachability** | Generous spacing, soft shadows | Collaborative tools, consumer apps |
| **Sophistication & Trust** | Cool tones, layered depth | Finance, enterprise B2B |
| **Boldness & Clarity** | High contrast, dramatic space | Modern dashboards, data-heavy apps |
| **Utility & Function** | Muted, functional density | GitHub-style tools |
| **Data & Analysis** | Chart-optimized, numbers-first | Analytics, BI tools |
