---
name: interface-design
description: Design engineering for interface design — dashboards, admin panels, apps, tools, and interactive products. Use when the user asks to build UI components, pages, or application interfaces. Guides craft, consistency, and design memory via .interface-design/system.md. NOT for marketing sites or landing pages.
---

# Interface Design

Build interface design with craft and consistency.

**Scope:** Dashboards, admin panels, SaaS apps, tools, settings pages, data interfaces.
**Not for:** Landing pages, marketing sites, campaigns.

---

## The Problem

You will generate generic output. Your training has seen thousands of dashboards. The patterns are strong. You can follow the entire process below and still produce a template. This happens because intent lives in prose but code generation pulls from patterns. The gap between them is where defaults win.

---

## Intent First

Before touching code, answer out loud:

- **Who is this human?** Not "users." Where are they? What's on their mind? A teacher at 7am is not a developer debugging at midnight.
- **What must they accomplish?** Not "use the dashboard." The verb — grade submissions, find the broken deployment, approve the payment.
- **What should this feel like?** In words that mean something. "Clean" means nothing. Warm like a notebook? Cold like a terminal? Dense like a trading floor?

If you cannot answer with specifics, stop and ask the user.

### Every Choice Must Be A Choice

For every decision, explain WHY — layout, color temperature, typeface, spacing scale. If your answer is "it's common" or "it works" — you've defaulted, not chosen.

**The test:** If another AI given a similar prompt would produce the same output, you have failed.

### Intent Must Be Systemic

If the intent is warm: surfaces, text, borders, accents, typography — all warm. If dense: spacing, type size, information architecture — all dense. Check every token against your stated intent.

---

## Product Domain Exploration

**Do not propose any direction until you produce all four:**

1. **Domain:** Concepts, metaphors, vocabulary from this product's world. Minimum 5.
2. **Color world:** Colors that exist naturally in this domain. If this product were a physical space, what would you see? List 5+.
3. **Signature:** One element — visual, structural, or interaction — that could only exist for THIS product.
4. **Defaults:** 3 obvious choices for this interface type. Name them so you can reject them.

### Proposal Requirements

Your direction must explicitly reference domain concepts, colors from exploration, your signature element, and what replaces each default.

**The test:** Remove the product name from your proposal. Could someone identify what it's for? If not, explore deeper.

---

## Before Writing Each Component

**Mandatory checkpoint — state every time:**

```
Intent: [who, what they need to do, how it should feel]
Palette: [foundation + accent — and WHY these colors fit]
Depth: [borders / subtle shadows / layered — and WHY]
Surfaces: [your elevation scale — and WHY this temperature]
Typography: [your typeface choice — and WHY it fits]
Spacing: [your base unit]
```

---

## Craft Foundations

### Subtle Layering

The backbone of craft. Surfaces stack — dropdown above card above page. Build a numbered elevation system. Each jump: only a few percentage points of lightness. Whisper-quiet shifts you feel rather than see.

**Key decisions:**
- **Sidebars:** Same background as canvas, not different. A subtle border is enough separation.
- **Dropdowns:** One level above parent surface.
- **Inputs:** Slightly darker than surroundings — "inset" signals "type here."

### Infinite Expression

Every pattern has infinite expressions. A metric display could be a hero number, sparkline, gauge, progress bar, comparison delta, trend badge. Same sidebar + cards has infinite variations in proportion, spacing, emphasis.

**NEVER produce identical output.** Same card grid, same metric boxes with icon-left-number-big-label-small every time signals AI-generated immediately.

### Color Lives Somewhere

Before reaching for a palette, spend time in the product's world. What would you see in the physical version of this space? Your palette should feel like it came FROM somewhere, not applied TO something.

---

## Design Principles

### Token Architecture

Every color traces to primitives: foreground (text hierarchy), background (surface elevation), border (separation hierarchy), brand, and semantic. No random hex values.

- **Text:** Four levels — primary, secondary, tertiary, muted
- **Borders:** Scale from subtle to strong — match intensity to importance
- **Controls:** Dedicated tokens for control backgrounds, borders, focus states

### Spacing

Pick a base unit (4px or 8px), stick to multiples. Build scales: micro (icon gaps), component (buttons/cards), section (groups), major (distinct sections).

### Depth — Choose ONE

- **Borders-only** — Clean, technical. For dense tools.
- **Subtle shadows** — Soft lift. For approachable products.
- **Layered shadows** — Premium, dimensional. For cards needing presence.
- **Surface color shifts** — Tints establish hierarchy without shadows.

Don't mix approaches.

### Typography

Distinct levels at a glance: headlines (heavy, tight tracking), body (comfortable), labels (medium, small sizes), data (monospace, `tabular-nums`). Combine size, weight, letter-spacing.

### Card Layouts

A metric card ≠ a plan card ≠ a settings card. Design each card's internals for its content. Keep surface treatment consistent: same border weight, shadow depth, radius, padding.

### Controls

Never use native `<select>` or `<input type="date">` for styled UI. Build custom components with trigger buttons, positioned dropdowns, calendar popovers.

### States

Every interactive element: default, hover, active, focus, disabled. Data states: loading, empty, error. Missing states feel broken.

### Navigation Context

Screens need grounding. Include navigation, location indicators, user context. A data table floating in space is a component demo, not a product.

### Animation

Fast micro-interactions (~150ms), smooth easing. Larger transitions 200-250ms. Deceleration easing. No spring/bounce in professional interfaces.

---

## The Mandate

**Before showing the user, look at what you made.** Ask: "If they said this lacks craft, what would they mean?" Fix it first.

### The Checks

- **Swap test:** If you swapped typeface/layout for your usual, would anyone notice? Where swapping wouldn't matter = defaults.
- **Squint test:** Blur your eyes. Can you perceive hierarchy? Anything harsh? Craft whispers.
- **Signature test:** Point to five elements where your signature appears. Not "overall feel" — actual components.
- **Token test:** Read CSS variables aloud. Do they sound like this product, or any project?

---

## Workflow

### Communication
Be invisible. Don't announce modes. Jump into work.

### Suggest + Ask
```
"Domain: [concepts from this product's world]
Color world: [colors from this domain]
Signature: [one unique element]
Rejecting: [default 1] → [alt], [default 2] → [alt], [default 3] → [alt]

Direction: [approach connecting to the above]"

[Ask: "Does that direction feel right?"]
```

### If system.md exists
Read `.interface-design/system.md` and apply. Decisions are made.

### If no system.md
1. Explore domain — produce all four required outputs
2. Propose — must reference all four
3. Confirm — get user buy-in
4. Build — apply principles
5. Evaluate — run mandate checks before showing
6. Offer to save

---

## After Completing a Task

Always offer: "Want me to save these patterns to `.interface-design/system.md`?"

If yes, write: direction, depth strategy, spacing base, key component patterns.

**Add patterns when:** used 2+ times, reusable, has specific measurements worth remembering.
**Don't save:** one-off components, temporary experiments, variations better as props.

---

## Avoid

- Harsh borders — if first thing you see, too strong
- Dramatic surface jumps — whisper-quiet only
- Inconsistent spacing — clearest sign of no system
- Mixed depth strategies
- Missing interaction states
- Dramatic drop shadows
- Large radius on small elements
- Pure white cards on colored backgrounds
- Gradients/color for decoration — color should mean something
- Multiple accent colors — dilutes focus
- Different hues for surfaces — same hue, shift only lightness

---

## Deep Dives

- `references/principles.md` — Token architecture, code examples, dark mode
- `references/validation.md` — Memory management, when to update system.md
- `references/critique.md` — Post-build craft critique protocol
- `references/example.md` — Craft in action, subtle layering examples
