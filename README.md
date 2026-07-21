# AfterAI

> **Your AI said done. AfterAI shows the receipts.**

AfterAI turns today's Codex CLI sessions into an evidence-backed work receipt. It shows what Codex claimed, what the local logs actually recorded, and what was genuinely verified.

**Local. Offline. No account. No API key. No telemetry.**

## Run today's receipt

Requires Node.js 20 or newer.

```bash
npx github:chenjiatong1989-pixel/afterai today
```

AfterAI reads the Codex session logs already stored on your machine. You do not need to wrap Codex, configure a proxy, or send your work to another model.

Or install it once and keep the daily command:

```bash
npm install --global github:chenjiatong1989-pixel/afterai
afterai today
```

Useful output options:

```bash
afterai today                 # today's evidence receipt in the terminal
afterai today --json          # the same receipt as machine-readable JSON
afterai today --path ./logs   # inspect an explicit JSON/JSONL source
afterai --demo                # run the included deterministic sample
```

Running `afterai` with no period is equivalent to `afterai today`.

## One receipt, eight acceptance fields

Every field is reported even when the honest answer is `Unknown`.

| Field | Question it answers |
| --- | --- |
| Work | What did Codex work on? |
| Successes | Which tasks or checks completed successfully? |
| Failures | What failed, stopped, or still needs review? |
| Changed files | Which files were recorded as modified? |
| Tests | Did a test, build, lint, or type-check command actually pass? |
| Repeated attempts | How many retries or repeated failing commands were observed? |
| Model | Which model did the session record? |
| Tokens | How many tokens did Codex expose in its local logs? |

A receipt is not allowed to turn missing data into a confident answer.

## Claim is not evidence

AfterAI keeps three different ideas separate:

| State | Meaning |
| --- | --- |
| `Claimed` | Codex said something was done. This is a statement, not proof. |
| `Observed` | A local event was recorded, such as a file edit, command, exit code, or token counter. |
| `Verified` | An observed deterministic check supports the completion claim. |

For example, “tests passed” in the final assistant message is only `Claimed`. A recorded test command with exit code `0` is `Observed`. It becomes verification evidence only when it supports the work being accepted.

## Evidence confidence

Every value also carries a provenance label:

- **Exact** — read directly from a structured event or deterministic result.
- **Estimated** — inferred from multiple observations; the method should be visible.
- **Unknown** — absent, ambiguous, or unsafe to attribute.

`Exact` means the event was captured exactly. It does **not** mean the software is correct. An exact exit code proves that a command returned that code; it does not prove that the test suite covered the right behavior.

## What the receipt should reveal

```text
AFTERAI WORK RECEIPT · TODAY
VERDICT  VERIFIED · Estimated

WHAT AI DID          [Estimated]  Work across 2 observed files
SUCCEEDED            [Estimated]  Work across 2 observed files
FAILED               [Estimated]  None
CHANGED FILES        [Exact]      src/login.js, test/login.test.js
TESTS REALLY PASSED  [Exact]      Passed
RETRIES              [Estimated]  0
MODELS                [Exact]      gpt-5.6-sol
TOKENS                [Exact]      126842
```

The useful result is not a wall of logs. It is the shortest honest answer to: **Can I accept this work?**

## Privacy contract

The core `today` workflow is local and read-only with respect to Codex sessions:

- no log, prompt, source file, or path is uploaded;
- no analytics or background telemetry is sent;
- no network request is needed;
- no second AI call is made to summarize the first AI;
- JSON and HTML outputs stay on your machine unless you move them.

Receipts omit raw prompts, replies, code, command output, and absolute source paths. Repository-relative filenames, model IDs, and activity metadata can still be sensitive, so review a receipt before sharing it.

Some legacy experimental commands may still exist in the repository. They are outside the v0.1 product contract; the `afterai today` acceptance receipt never opts into them or sends data on their behalf.

## v0.1 scope

v0.1 deliberately supports one workflow:

1. Read today's local Codex CLI sessions.
2. Produce the eight-field work receipt.
3. Separate claims, observations, and verification.
4. label every conclusion `Exact`, `Estimated`, or `Unknown`.
5. Point to the work that needs human review.

### Non-goals

- real-time monitoring, tracing, or session replay;
- a hosted dashboard or team analytics service;
- token pricing, billing estimates, or leaderboards;
- Claude, Cursor, or broad multi-agent coverage as a release requirement;
- another LLM-generated daily summary;
- replacing Git, CI, code review, or human acceptance;
- claiming that a passing command proves the whole feature is correct.

Ship the receipt first. Expand only after this loop is trustworthy.

## Product principles

1. Evidence before narrative.
2. Unknown before invented certainty.
3. Conclusions before raw detail.
4. Local evidence stays local.
5. One clear next action beats ten weak suggestions.

See [docs/PRODUCT.md](docs/PRODUCT.md) for the v0.1 evidence contract and release boundary.

## License

MIT
