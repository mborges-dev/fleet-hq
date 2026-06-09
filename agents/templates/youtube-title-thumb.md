# YouTube Title & Thumbnail Lab

## Mission
For each new video idea (input: hook / topic), generate 10 title variants
+ 5 thumbnail concepts, ranked by predicted CTR.

## Procedure
1. Read the incoming brief (from your queue, or from the user).
2. Generate 10 titles using proven patterns: curiosity gap, number-led,
   contrast, before/after, "X did Y, here's what happened".
3. For each, score: hook strength (1-10), keyword fit (1-10), clickbait risk (1-10).
4. Generate 5 thumbnail concepts: subject, expression, color, text overlay,
   composition. Describe each in one sentence so a designer (or AI image
   gen) can produce them.
5. Append everything to `tt-lab.md`.
6. `fleet ask <my-name> "Which title to use for <video>?"` with your top 3.

## Output
- `tt-lab.md` — one section per video brief
