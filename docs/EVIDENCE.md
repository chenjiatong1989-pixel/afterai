# Evidence contract

AfterAI is an evidence receipt, not an authority on whether software is correct.
It separates three things that agent summaries often blur together:

1. **Claimed** — what the agent said it completed.
2. **Observed** — what a named local source recorded, such as a tool exit code,
   model identifier, token counter, or file operation.
3. **Verified** — what an explicit verifier established against a known worktree
   state.

An agent claim can describe the work, but it can never verify itself.

## Evidence labels

Every receipt value has one of these labels. The label describes the provenance
of that value, not the general quality of the work.

### Exact

`Exact` means AfterAI copied or deterministically calculated the value from a
named source without semantic guessing. Examples include a structured command
exit code, a model identifier in a Codex event, and a token counter exposed by
the source log.

`Exact` does **not** mean:

- the source was honest, complete, or tamper-proof;
- an exit code of zero proves the user's requirement was met;
- a recorded file operation proves the final file survived;
- a current Git diff proves Codex, rather than a person or another process,
  made the change;
- a token count is an invoice.

Local session logs can be edited. Until receipts are bound to an authenticated,
append-only source, `Exact` means "exact according to this local source."

### Estimated

`Estimated` means the value depends on a documented inference or heuristic.
Examples include grouping similar failed commands into one retry pattern,
classifying a shell command as a test, or summarizing a sequence of tool events
as one task.

An estimate must retain its method and inputs. It must not be relabeled Exact
because the same heuristic produces the same answer twice.

### Unknown

`Unknown` means the available evidence cannot support a value. Missing token
metadata is Unknown, not zero. A missing model is Unknown, not the current
default model. File attribution without a captured baseline is Unknown, even if
the final Git diff is known exactly.

Unknown is a valid and useful result. It prevents a false green receipt.

## Downgrade rules

AfterAI only downgrades when evidence is incomplete or stale; it never upgrades
weak evidence from an agent's prose.

| Condition | Required result |
| --- | --- |
| Agent says tests passed, but no structured verifier result exists | `Unknown` verification |
| Verifier exits non-zero | `Failed` verification |
| Verifier exits zero, then a tracked file is changed | `Stale`; the task is not Verified |
| Worktree was already dirty and no baseline snapshot exists | final diff may be Exact; Codex attribution is `Unknown` |
| Token event is absent or incomplete | missing token fields are `Unknown`, never inferred as zero |
| More than one model is recorded | preserve the ordered, de-duplicated model list |
| A JSONL line is malformed or truncated | ignore that line, emit a source warning, and downgrade affected fields |
| Evidence sources disagree | keep both observations and downgrade the conclusion |

## Verification freshness

A passing test is fresh only when it is bound to the same repository state that
the receipt evaluates. The preferred binding contains:

- repository identity;
- `HEAD` commit;
- a digest of tracked and untracked worktree changes;
- verifier command and exit code;
- verifier completion time.

Any relevant file change after that verifier makes the result stale. When
AfterAI only observes a historical Codex command and has no state digest, it may
report the exact recorded exit code, but it must not claim current-state
verification.

AfterAI must not guess and automatically execute a test command discovered in a
log. Verifiers can be expensive or have side effects. Automated verification
requires an explicit user-configured command.

## File evidence and dirty baselines

There are three distinct file statements:

- **operation observed** — a structured tool event named a file;
- **present in final diff** — Git currently reports the file as changed;
- **attributed to this run** — a captured clean/dirty baseline and final state
  show that this run introduced the change.

The first two can be Exact independently. The third is Unknown without a
baseline or an isolated worktree. Pre-existing user work must never be credited
to the agent.

## Token and model evidence

Codex token events may be cumulative snapshots. AfterAI uses the latest complete
cumulative snapshot for a session rather than summing snapshots and
double-counting usage. If only some token categories exist, absent categories
remain Unknown in the evidence representation.

Models are session/turn observations, not a single guessed default. Receipts
preserve every recorded model in first-seen order. Pricing and account billing
are separate questions and are never Exact merely because token usage is Exact.

## Privacy boundary

Receipt exports use an allowlist. By default they may contain counts, evidence
labels, sanitized repository-relative file names, normalized verifier names,
model identifiers, timestamps, and token counters.

They must not contain:

- raw prompts or assistant replies;
- source code or raw tool output;
- absolute paths, home-directory names, or session-log locations;
- environment values, credentials, tokens, or endpoint query strings.

The full in-memory analysis may need private source data to derive a receipt.
That does not make the private data safe to serialize. JSON, terminal, and HTML
renderers share the same export boundary.

## Receipt invariant

The most important invariant is:

> No missing, stale, self-reported, or unattributed evidence can produce a
> Verified verdict.

