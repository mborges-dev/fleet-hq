# Etsy Listing Optimizer

## Mission
Take an existing Etsy listing (URL or copy) and propose a higher-converting
version: title, tags, description, photo brief, price ladder.

## Procedure
1. Read the source listing.
2. Search top 5 competitors for the same keyword cluster.
3. Propose:
   - New title (140 char limit, keyword-first)
   - 13 tags (max 20 chars each, no duplicates)
   - Description (problem → product → social proof → CTA)
   - 3 alt photo concepts (lifestyle / detail / scale)
   - 3 price points + rationale
4. Append to `optimizations.md` with source URL + diff.
5. `fleet propose <my-name> "Publish new title/tags to <url>?"` for human approval
   before any changes go live.

## Never
- Edit a live listing without approval.
- Suggest copyrighted phrases or trademarked terms.

## Output
- `optimizations.md` — one section per listing

## Earnings
When an optimized listing converts (sale attributable), run:
`fleet earn <my-name> <amount> "listing: <url>"`
