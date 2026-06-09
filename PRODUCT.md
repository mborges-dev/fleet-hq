# Product

## Register

product

## Users

The operator (single user). Sits at a Mac, runs a fleet of multiple autonomous Claude
agents distributed across 8 specialized "worlds" (HQ, Research, Intelligence,
Etsy, YouTube, Fiverr, AI-Dropship, …). Uses the dashboard to:

- See at a glance: who is working, what they're earning, what's burning tokens
- Approve proposals + answer agent asks in real time
- Chat with individual agents or broadcast to a world
- Track revenue progress toward a monthly goal (their monthly revenue target)

Context: this is the operator's living "war room." It's open all day. He
glances at it dozens of times. It's not a setup app or admin panel — it's
ambient HUD.

## Product Purpose

Make the autonomous agent fleet legible at a glance and operable in seconds.
The dashboard exists so that one human can supervise dozens of agents working
continuously without losing context or missing escalations.

Success: the operator can spot a blocker, click into the responsible world, message
the agent, and close the loop in under 30 seconds, without leaving the screen.

## Brand Personality

**Cyberpunk command center.** AAA video-game HUD, not SaaS dashboard. Three
words: **alive, dense, neon.**

- Reference vibes: Death Stranding's chiral network UI, System Shock terminals,
  Cyberpunk 2077 braindance scrubber, Halo's UNSC battle screens, Helldivers 2
  Super Earth comms. The aesthetic is "you're at the bridge of a small ship in
  the off-world economy."
- Voice in copy: terse, operational, lowercase fragments are fine. Numbers
  prevail over adjectives. No friendliness, no exclamation marks.

## Anti-references

What this is NOT:

- **Linear / Notion / Vercel dashboards.** Soft pastels, white space worship,
  rounded-2xl everywhere, "made it cozy" energy. Refuse.
- **Friendly SaaS onboarding tone.** No "Welcome back, the operator!" copy.
- **Generic admin templates** (Tailwind UI's `dashboard-01.html`). The bento
  grid of identical KPI cards with gradient accents = bin.
- **Pastel cyberpunk** (the kind where neon is decoration on a Notion layout).
  Either commit to the dark-neon density or don't.

## Design Principles

1. **Every pixel is an instrument reading.** Density is a feature. Whitespace
   exists to separate readings, not to "breathe."
2. **The HUD is alive.** Activity = motion. Stale = stillness. If nothing is
   moving on screen, nothing is happening; if everything moves, something is
   wrong.
3. **Show the work, not the labels.** Agents walking inside their world tells
   you who's busy without reading the chat. Action bubbles are status. The map
   is the source of truth, not a thumbnail.
4. **Operate from one screen.** Map ↔ world ↔ chat in zero navigation. The
   only "page" is the map; everything else is overlay or zoom.
5. **Numbers earn the eye.** Show real currency, real counts, real token
   burn — not "12 active." If it's not a number, it's lore.

## Accessibility & Inclusion

Single-user product, so this is "make it work for the operator" not "WCAG-AA for
everyone." That said:

- Body text ≥ 4.5:1 contrast against its bg (neon green on dark navy passes)
- `prefers-reduced-motion`: respect it. Sprite movement freezes, only
  essential pulses remain. Required.
- No flashing > 3Hz (the data-packet pulse animation is ~0.4Hz, safe)
- Keyboard shortcuts on the bottom HUD strip (N V G $ S C A Q M letters)
- Readable at 1280×800 minimum (the operator's MacBook); designed for 1440×900+
