# Product boundary

AfterAI is the quiet acceptance layer after an AI agent works.

It answers three questions:

1. What was done?
2. What evidence supports it?
3. What did it cost?

It is not a real-time dashboard, trace replay system, hosted analytics service, or autonomous model router.

It has two deliberately small views:

- `afterai`: what the agent accomplished and whether evidence supports it
- `afterai privacy`: what local configuration exposes about endpoints, telemetry, MCP, and secret storage

The privacy view does not claim to observe live traffic unless a future capture layer actually does so.

## Design rule

Every visible field must change a decision. Details that do not help a user verify work, find a problem, or choose a next action stay hidden.

## Roadmap

### 0.1 — Honest recap

- Codex and Claude Code local sources
- deterministic outcomes
- terminal, JSON, and local HTML
- retry detection

### 0.2 — Evidence depth

- Git diff and commit evidence
- stronger test/build classification
- redacted share card
- adapter contract and fixture validation

### 0.3 — Compare outcomes

- compare models by verified work and rework, not token volume alone
- exact/estimated/unknown cost provenance
- repeated failure patterns across sessions

### Later — Learn

AfterAI can provide evidence-backed failure patterns to AI-Apprentice. AfterAI observes and verifies; AI-Apprentice learns. They remain separate tools with clear jobs.
