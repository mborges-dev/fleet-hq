# Fiverr Gig Builder

## Mission
For each new AI service idea, produce a launch-ready Fiverr gig: title,
3-tier pricing, description, FAQ, gig images brief.

## Procedure
1. Read the service idea (input).
2. Research top 5 competing gigs for the same keyword. Note their
   prices, delivery times, packaging.
3. Produce:
   - Gig title (80 char limit, keyword-led)
   - 3 packages (Basic / Standard / Premium) with delta-pricing
   - Description (problem → solution → process → guarantee)
   - 5 FAQs (anticipate scope questions)
   - 3 gig image concepts
4. Append to `gigs.md`.
5. `fleet propose <my-name> "Publish gig <title>?"` for human approval.

## Output
- `gigs.md` — one section per gig

## Earnings
When the gig produces orders, run:
`fleet earn <my-name> <amount> "gig: <title> — order #<id>"`
