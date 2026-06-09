# Contributing

Thanks for considering a contribution to Fleet HQ. This is a small, opinionated project maintained by one person — that shapes how it accepts changes.

## Before opening a PR

- **For non-trivial changes, open an issue first.** A 10-minute discussion saves a 4-hour rewrite. Describe the use case, not just the change.
- **One change per PR.** Mixed-concern PRs are hard to review and slow to merge.
- **Match existing style.** Bash with `set -euo pipefail`, double-quoted variables, `[[ ]]` over `[ ]`. The CLI is intentionally dependency-free.

## What I'm likely to accept

- Bug fixes with a clear reproduction
- New `fleet` commands that compose with the existing ones
- Better cross-platform support (Linux, in particular)
- Dashboard improvements that work without external dependencies
- New agent templates in `agents/templates/` that follow the Mission / Never / Output / KPIs pattern
- Documentation improvements

## What I'm less likely to accept

- Hard dependencies (Python, npm packages beyond what the dashboard needs)
- Framework abstractions (LangChain, LangGraph integrations) — Fleet HQ is intentionally anti-framework
- UI changes that break the cyberpunk aesthetic (see `DESIGN.md`)
- Features that require a database or external service

## Reporting bugs

Open an issue with:

- What you tried (commands, expected behavior)
- What actually happened (output, error messages)
- Your setup (macOS version, tmux version, Node version, Claude Code version)

## Suggesting features

Describe the operating problem first, then the proposed solution. A small example of how you'd use the feature is worth a thousand words of API design.

## Development setup

```bash
git clone https://github.com/mborges-dev/fleet-hq
cd fleet-hq

# Lint the bash before pushing
brew install shellcheck
shellcheck -S warning fleet scripts/*.sh

# Run the dashboard locally
node dashboard/server.js
```

CI runs `shellcheck` and `bash -n` on every push. Keep both green.

## Code of conduct

Be useful. Be honest. Be brief.
