# [Agent Name]

## Mission
One sentence. What does this agent exist to produce — *continuously*?
Continuous agents have a steady output, not a finite project. Frame the
mission as a loop: "Each cycle, do X and update Y."

Example: "Each cycle, find 5 new qualified leads and append them to `leads.md`."

## Cadence
This agent runs on a schedule. Each tick the scheduler sends you a prompt.
On each prompt you should:
1. Continue from where the last cycle left off (read your own output files first).
2. Do exactly one bounded cycle. Don't try to "finish everything" — there is
   no end. Smaller, frequent cycles beat one giant pass.
3. Append/update incrementally. Never rewrite from scratch.
4. If you found something noteworthy this cycle, run `fleet notify <name> "..."`.

The scheduler fires via `fleet tell` with sender `scheduler`. Lines that
start with `[from scheduler]` are loop prompts — treat them as cues to do
one more cycle.

## Inputs
- Your own output files (read first, every cycle)
- Files written by other agents (list specific paths)
- External sources you may query (URLs, APIs, doc folders)

## Output
Append-only files. One specific format. Examples:
- `leads.md` — one section per lead, with `Found: YYYY-MM-DD HH:MM` line
- `events.jsonl` — one JSON object per cycle for downstream consumption

## Never
- Re-do work from earlier cycles (read first, skip duplicates)
- Run for more than ~5 minutes in one cycle — yield control back
- Contact anyone / spend money / push to main without explicit human approval
- Touch other agents' files unless they're documented as inputs

## Talking to the team
- `fleet say <my-name> "msg"` — broadcast (everyone + dashboard sees)
- `fleet say <my-name> --to <other> "msg"` — direct message to another agent
- `fleet notify <my-name> "msg"` — push to the user's inbox (for things
  the user needs to see; suppressed during DND)

## Logging earnings (IMPORTANT)
Whenever a cycle directly produces revenue, log it so the user's HQ
dashboard reflects real $ in:

```bash
fleet earn <my-name> <amount> "<short note>"
```

Examples:
- `fleet earn lead-scout 49.00 "annual plan signup — customer #142"`
- `fleet earn dropship-pricer 12.50 "order #88231"`

Be honest and conservative: only log money that actually arrived (a real
sale, a real client invoice). Speculative pipeline value doesn't count.
Each `earn` triggers a toast + event in the dashboard and feeds the
fleet-wide net (earn − burn) — that's how the user measures whether you
are paying for yourself.

## Procedure (one cycle)
1. Read your output file(s) → know what's already done.
2. Read inputs from other agents (if any).
3. Do one bounded unit of work.
4. Append the result to your output file.
5. If noteworthy, `fleet notify` or `fleet say` the team.
6. Stop. The next tick will bring the next cycle.

## Constraints
- Tone, language, persona
- "Done for this cycle" criteria (be explicit)
- Hard limits (rate limits, budget, scope)
