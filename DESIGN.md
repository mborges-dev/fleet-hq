# Design

## Theme

**Cyberpunk command-bridge HUD over deep space.** Dark navy near-black body,
saturated neon green as the only spectral accent that earns the eye, with
warm ivory cream as the only "light" tone (no white). Every chrome edge has
glow. Inspired by Death Stranding's chiral UI and Halo's UNSC battlescreen,
not by web-app dashboards.

## Color System

OKLCH equivalents in parens for future port. Today's hex is what's in code:

```css
/* Surfaces — deep space ramp */
--bg:        #04060A;  /* oklch(0.103 0.012 250)  — body */
--space:     #06080D;  /* oklch(0.118 0.012 252) */
--surface:   #11141C;  /* oklch(0.196 0.014 256)  — cards/panels */
--surface2:  #161A24;  /* oklch(0.225 0.016 257)  — nested */

/* Ink — warm ivory, NEVER pure white */
--text:      #F2EEE5;  /* oklch(0.947 0.013 88)  — body copy */
--muted:     #6B6E7A;  /* oklch(0.493 0.014 263) — secondary */
--muted2:    #3B3E4A;  /* oklch(0.314 0.014 263) — labels */

/* Accent — single saturated commit */
--accent:    #3BD66D;  /* oklch(0.799 0.214 145) — primary action / data alive */
--green:     #84C7AE;  /* oklch(0.789 0.084 159) — secondary / HQ chrome */

/* Action-color ramp (per-agent state) */
--yellow:    #E6C963;  /* writing/editing */
--cyan:      #7BC4D6;  /* thinking */
--red:       #E16060;  /* errors / asks */
--muted:     gray      /* idle */
```

### Strategy

**Committed**: one saturated color (neon green) carries the meaning of
"active / online / earning." Everything alive glows green. Everything static
is desaturated. There is no second accent competing for attention.

### Per-world chrome colors

Each world owns one hue used only in its own module/world-frame, never in
shared HUD:

```
hq          #84C7AE  pale jade
research    #7BC4D6  cyan
intelligence #C895D6 lilac
etsy        #D6986C  amber
youtube     #E16060  red
fiverr      #3BD66D  neon green
ai-dropship #D69D7B  rust
examplebrand    #A9D67B  olive
```

## Typography

Single family + weight contrast. No serif. No second sans. Mono used only
where it earns its place (numbers, agent IDs, timestamps).

```css
--sans: -apple-system, "SF Pro Display", Inter, system-ui, sans-serif;
--mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

### Scale

```
HUD label              10-11px  uppercase  letter-spacing .22em
Body                   13-14px
Stat value             22px     mono       letter-spacing -.01em
Module name            10px     uppercase
Agent name (sprite)    8.5px    mono
H-tier (rare)          16-18px  weight 600
```

Heading max: 22px (HUD stats). This is a HUD, never a marketing page; no
display type. Letter-spacing on uppercase labels stays ≥ .15em.

## Spacing & Layout

```css
--header-h:    68px;
--bottombar-h: 52px;
--right-w:     <chat panel width — fluid>
```

Stage occupies the center (map ↔ world view), chat on the right, HUD top +
bottom. **Bento or grid layouts are explicitly off-brand.** Density first.

### Z-index scale

```
0    map content + sprites
5    Three.js 3D canvas overlay
50   HUD top/bottom strips
90   action-bar overlays (back-to-station, add-venture)
100  HQ frame corners + edges (chrome)
200  modals (none today)
300  toasts (none today)
```

## Components

### HUD frame

The bright neon corners + edge highlights around the viewport. 4px thick.
Permanent on-screen "you're inside a machine" cue. Pulses ~0.4Hz on the
accent color (corner LEDs).

### Top stat strip

5 stats (AGENTS, EARN, BURN, NET, CYCLES). Each is `label + value` in mono,
value 22px, label 9.5px uppercased. Right side: SCHED/DND/PANEL toggles +
clock.

### Bottom button bar

9 gamepad-style chunky buttons with a keyboard hotkey letter chip in the
upper-right. AGENT, VENTURE, GOAL, LOG $, SCHED, CHAT, APPROVE, ASKS, MAP.
Width auto, height fixed at 52px.

### World module (on map)

A rendered 3D-looking image of the world's interior + hanging name plate
below + icon ornament above. Optional ask-count badge top-right. No card
frame, no rectangle stripe — the render IS the module. Hover: gentle scale
1.04 + glow bump.

### Sprite (agent inside world)

Three.js skeleton model walking on the floor. SVG layer above renders the
floating label (agent name) + speech bubble (current action).

### Chat panel

Right-side rail. Tabs at top (Chat, Approve, Asks, Ventures, Sched). Each
chat row: sender → receiver chip + timestamp + message bubble.

## Motion

```css
--ease:      cubic-bezier(.4, 0, .2, 1);
--ease-out:  cubic-bezier(.16, 1, .3, 1);  /* ease-out-expo */
--ease-snap: cubic-bezier(.34, 1.56, .64, 1);  /* slight overshoot, rare */

--dur-fast:    120ms;   /* hover state */
--dur-mid:     240ms;   /* panel open, mode switch */
--dur-slow:    600ms;   /* enter world transition */
```

### Categories of motion in this UI

1. **Living chrome**: corner LEDs pulse, scanlines drift, data-packets stream
   along pipes between worlds. Continuous, low amplitude. Carries the
   "system is alive" signal.
2. **Sprite locomotion**: skeleton walking animation (driven by Three.js
   AnimationMixer). Continuous when moving.
3. **State change**: hover/active on buttons, mode toggle on top-right pills,
   number ticker on stat values.
4. **Transitions**: map ↔ world enter/exit, world rotate-in.

### Reduced motion

`@media (prefers-reduced-motion: reduce)` halts: corner LED pulse, data
packets, scanlines, sprite locomotion idle bob. Keeps: state-change feedback
(hover/active), instant transitions for mode switch.

## Iconography

Custom inline SVG icons (Lucide-style), 16px standard, stroke 1.8-2px,
`currentColor`. Stored in `ICONS` map keyed by name (radar, magnifier, brain,
book, cart, vault, flame, bolt, globe, store...).

## Imagery

- World interiors: rendered isometric dioramas per world (`world-{id}.jpg`),
  paired with 3D GLBs (`world-{id}.glb`) for the deep-dive view
- HQ: ambitious central command bridge variant
- Skeleton character: single rigged `skel3d.glb`, cloned per agent, walks
  inside each world

## Accessibility tokens

```css
--contrast-body-min:   4.5;     /* WCAG AA */
--contrast-large-min:  3.0;
```

Body text (`#F2EEE5` on `#04060A`): contrast 15.2 — passes everywhere.
Muted (`#6B6E7A` on `#04060A`): 4.7 — passes for body, borderline for small.
Always escalate to `--text` for any sentence the operator must read.
