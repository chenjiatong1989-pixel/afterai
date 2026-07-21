# AfterAI product contract

## Product sentence

> **Your AI said done. AfterAI shows the receipts.**

AfterAI is the local evidence acceptance layer for Codex CLI. Its v0.1 job is to turn today's saved Codex work into one receipt that a developer can inspect in seconds.

It does not ask users to watch an agent work. It answers the question that remains after the agent stops:

> **Can I accept what Codex says it completed?**

## The user and the moment

The primary user runs Codex CLI on one or more repositories and returns later to review the result. They do not need another transcript, dashboard, or AI-written stand-up. They need a compact account of:

- what was attempted;
- what changed;
- what succeeded or failed;
- what was tested;
- what remains unproven.

`afterai today` is the primary product surface. With no explicit period, `afterai` means `afterai today`.

## The acceptance receipt

Every task-level receipt contains eight fields. A field remains present when its value is unknown; absence must never look like success.

| # | Field | Required content | Typical evidence |
| --- | --- | --- | --- |
| 1 | Work | The task or change Codex worked on | user request, final message, recorded edits |
| 2 | Successes | Completed checks or outcomes supported by evidence | successful command results, completed turn |
| 3 | Failures | Failed commands, aborted work, or unresolved steps | non-zero exit codes, failure events, explicit incomplete message |
| 4 | Changed files | Files attributable to the recorded work | structured file-change or patch events |
| 5 | Tests | Observed test/build/lint/type-check commands and results | command, output, exit code, ordering relative to edits |
| 6 | Repeated attempts | Re-runs and repeated failures | normalized command repetitions and result sequence |
| 7 | Model | Model identifier exposed by Codex | session or turn metadata |
| 8 | Tokens | Input, cached input, output, reasoning, or total tokens when exposed | Codex usage events |

The top-level receipt should make failed and unverified work visible before totals or secondary detail.

## Three evidence states

These states describe how a conclusion relates to evidence. They are not interchangeable.

### Claimed

Codex stated that an action or outcome occurred.

Examples:

- “Implemented the parser.”
- “All tests pass.”
- “The issue is fixed.”

A claim can be captured exactly while still being unverified. The UI must never silently promote an agent's final message into proof.

### Observed

AfterAI found a corresponding local event.

Examples:

- an `apply_patch` event named two files;
- `npm test` ran and returned exit code `0`;
- a token-count event reported `126842`;
- the session metadata named `gpt-5.6-sol`.

Observation establishes that an event was recorded. It does not automatically establish that the intended outcome is correct.

### Verified

A deterministic observation supports the acceptance claim.

Examples:

- a relevant test command passed after the final recorded edit;
- a build or type-check required by the task completed successfully;
- a machine-verifiable output matches an explicit acceptance condition.

`Verified` must not mean “Codex said done,” “the turn completed,” or merely “some command exited 0.” Verification is scoped to the evidence actually available.

## Three provenance labels

Each displayed value carries one of these labels independently of its evidence state.

### Exact

The displayed value came directly from a structured Codex event or deterministic result without semantic inference.

Examples: a model slug, token counter, command string, exit code, or explicit patch path.

An exact observation proves only what it says. `npm test · exit 0 [Exact]` proves the recorded process returned zero. It does not prove adequate coverage, the correct environment, or production correctness.

### Estimated

The displayed value was inferred by a documented rule over multiple observations.

Examples: a concise task title synthesized from messages, grouping two failures as one repair loop, or attributing a working-tree change when direct patch evidence is incomplete.

The report should expose the inference method in JSON or detail output.

### Unknown

The source did not expose the field, observations conflict, or attribution would be unsafe.

Examples: missing model metadata, a dirty repository with concurrent edits, token events that cannot be de-duplicated, or a test whose relevance cannot be established.

Unknown is a successful honesty outcome, not a parser failure.

## Status rules

The receipt may summarize a task as:

| Status | Meaning |
| --- | --- |
| `Verified` | The completion claim has relevant deterministic evidence. |
| `Unverified` | Work or a completion claim exists, but adequate verification does not. |
| `Partial` | Progress exists, but the latest relevant verification failed or work is explicitly incomplete. |
| `Failed` | The run failed without a completed, supported result. |
| `Unknown` | The logs do not support a safe classification. |

The status is a review aid, not a correctness certificate.

## `today` behavior

`afterai today` must:

1. use the user's local calendar day;
2. discover local Codex CLI session data without wrapping Codex;
3. avoid mutating the source logs;
4. aggregate task-level receipts into one daily acceptance view;
5. retain failed and unverified tasks rather than hiding them behind totals;
6. populate all eight fields or explicitly return `Unknown`;
7. attach provenance to every material conclusion;
8. produce no network traffic or telemetry.

Supported presentation surfaces are terminal output, machine-readable JSON, and an optional static local HTML file. They must represent the same evidence contract.

## Privacy and trust boundary

The v0.1 core is local, offline, and passive:

- no account or API key;
- no hosted ingestion service;
- no background telemetry;
- no upload of prompts, source code, paths, or session metadata;
- no additional LLM call;
- no proxy between the user and Codex;
- no modification of Codex session logs.

Raw logs and generated receipts may contain sensitive material. Reports should minimize copied command output by default and warn users before sharing exports.

Legacy or experimental opt-in network features that remain in the repository are not part of this contract. They must not run from `afterai today`, influence the acceptance verdict, or appear in the primary product story.

## v0.1 scope

v0.1 includes only:

- Codex CLI as the promised and tested source;
- the current local day;
- the eight acceptance fields;
- Claimed / Observed / Verified separation;
- Exact / Estimated / Unknown provenance;
- terminal, JSON, and optional static HTML output;
- a deterministic public demo and fixtures;
- one clear next review action.

Adapters left over from earlier experiments may continue to exist, but they are compatibility code, not v0.1 positioning or release requirements.

## Explicit non-goals

The following must not delay v0.1:

- Claude, Cursor, or generalized multi-agent support;
- real-time observability, traces, timelines, or transcript replay;
- cloud dashboards, accounts, sync, teams, or notifications;
- token prices, billing reconstruction, exchange rates, or rankings;
- model comparison or recommendations;
- autonomous remediation or rerunning tests on the user's behalf;
- AI-generated summaries that consume more tokens;
- cryptographic certification or compliance claims;
- replacing Git, CI, test coverage, code review, or human judgment.

## Release gate

v0.1 is ready when one fresh install can run `afterai today` against representative Codex fixtures and local sessions, and:

- all eight fields appear;
- missing data is visibly `Unknown`;
- an agent claim alone never becomes `Verified`;
- a failed check remains visible even if a later check passes;
- the report identifies repeated attempts consistently;
- model and token data are de-duplicated or downgraded from `Exact`;
- terminal and JSON agree on task status and evidence;
- HTML, when requested, is static and local;
- the core workflow is demonstrably offline and emits no telemetry;
- automated tests cover verified, failed, partial, unverified, and unknown fixtures.

Nothing else is required to publish.

## Product principles

1. Evidence before narrative.
2. Never convert missing evidence into confidence.
3. Exact describes capture, not universal truth.
4. Failed and unverified work outrank vanity totals.
5. The report earns trust by showing its limits.
6. One daily receipt is the product; everything else is optional.
