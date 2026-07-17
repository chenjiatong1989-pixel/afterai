# AfterAI

> **Know what your AI actually did.**

Your coding agent says it finished. AfterAI checks the evidence, counts the tokens exposed by local logs, estimates their API-equivalent value, and lets you opt into a simple weekly Burn Rank.

**Local by default. No account. No API key. No uploaded logs.**

## Try it

Requires Node.js 20 or newer.

```bash
npx github:chenjiatong1989-pixel/afterai week --html
```

With no path, AfterAI looks for local Codex and Claude Code session directories. Missing or unreadable sources are skipped honestly.

## Commands

```bash
afterai                    # today's local recap
afterai yesterday          # yesterday's recap
afterai week               # last seven days
afterai --path ./logs      # custom JSON/JSONL source
afterai --html             # also save afterai-report.html
afterai --json             # machine-readable output
afterai --currency AUD     # override the system-region currency
afterai --refresh-rates    # explicitly refresh and cache exchange rates
afterai rank               # refresh the public weekly leaderboard
afterai rank --sync        # upload your anonymous summary, then refresh rank
afterai rank --sync --name "Token BBQ"
afterai rank --leave       # delete this device's leaderboard entry
afterai --demo             # evidence-backed sample
afterai privacy            # local AI privacy configuration snapshot
```

## Token value

AfterAI uses USD as the common base and converts the result to the currency inferred from the operating-system locale. For example, `en-AU` displays AUD. Use `--currency USD`, `--currency AUD`, or another three-letter ISO code to override it.

The report labels the result **API equivalent — Estimated**. It is not an account invoice and does not infer ChatGPT Plus, subscription allowances, discounts, taxes, or the amount actually billed.

- ordinary input, cached input, and output tokens are priced separately
- cached tokens are removed from ordinary input before calculation
- a range is shown when the logs do not expose the per-request context tier or model allocation
- an unknown or unsupported model makes the value `Unknown` rather than silently undercounting it
- model prices and bundled exchange rates carry snapshot dates

Normal reports make no network request. `--refresh-rates` is the only exchange-rate network action; it fetches daily central-bank rates from [Frankfurter](https://frankfurter.dev/) and stores them in `~/.afterai/rates.json`.

The bundled model-price snapshot is based on [official OpenAI API pricing](https://developers.openai.com/api/docs/pricing). Prices and exchange rates change, so the snapshot date is always displayed.

## Burn Rank

[Burn Rank](https://afterai-burn-rank.chenjiatong1989.chatgpt.site) deliberately has one main weekly leaderboard and one secondary Verified rank. Run `afterai rank` to refresh it. Run `afterai rank --sync` to explicitly upload the current week's summary and receive your rank.

`--sync` uploads only:

- a random anonymous device ID and public nickname
- total and Verified token counts
- the estimated USD range
- the current week

It does not upload chats, prompts, task titles, files, paths, logs, locations, or personal details. The anonymous identity secret stays in `~/.afterai/rank.json` so only that device can update or delete its entry. Rankings are for fun and are not audited billing records.

## Five honest outcomes

| Outcome | Meaning |
| --- | --- |
| `✓ Verified` | Completion has deterministic verification evidence. |
| `◌ Unverified` | Work changed, but completion was not proven. |
| `◐ Partial` | Some work exists, but the last verification failed. |
| `✕ Failed` | The run failed without a completed result. |
| `? Unknown` | The logs do not contain enough reliable information. |

## Privacy

- Logs stay on your computer.
- No account or API key is required.
- No network request occurs unless you explicitly run `--refresh-rates`.
- HTML reports are static local files.
- Missing values remain `Unknown`.

Raw AI logs can contain prompts, source code, paths, and secrets. Treat exported JSON and HTML as private unless you have reviewed them.

## Principles

1. Show conclusions before detail.
2. Separate claims from evidence.
3. Never disguise estimates as exact values.
4. Never spend more AI tokens just to count AI tokens.
5. Surface one next action, not ten weak suggestions.

## License

MIT
