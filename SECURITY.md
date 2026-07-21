# Security

AfterAI reads local agent logs. Treat every log as sensitive and untrusted: it
may contain prompts, assistant replies, source code, absolute paths, command
output, credentials, terminal escape sequences, malformed JSON, or content
chosen by a repository an agent inspected.

## Default boundary

Normal work and privacy recaps run locally and require no account, API key, or
telemetry. HTML reports are static local files.

Network access is limited to explicit features:

- `--refresh-rates` downloads a currency-rate snapshot;
- `rank` downloads the public leaderboard;
- `rank --sync` uploads the documented anonymous weekly summary;
- `rank --leave` requests deletion of that leaderboard identity.

These actions are not part of local evidence verification. AfterAI must not send
session logs, prompts, replies, source code, file names, project paths, or raw
tool output through them.

## Receipt export policy

Terminal, JSON, and HTML receipts use an allowlist rather than attempting to
redact arbitrary raw transcripts after the fact. A default exported receipt
must not contain:

- raw user prompts or assistant messages;
- raw source code or command output;
- absolute paths, user names, home directories, or source-log locations;
- environment values, access tokens, secrets, or URL credentials/query values.

Repository-relative paths may still be commercially sensitive. Treat any report
that includes them as private unless you have reviewed it. Renderers must escape
untrusted text for their destination; in particular, HTML output must not
interpret log content as markup or script.

Evidence labels do not provide integrity protection. `Exact` means exact
according to the named local source; local logs and Git state can be altered.
See [docs/EVIDENCE.md](docs/EVIDENCE.md) for the trust and downgrade rules.

## Safe parsing

- Malformed or truncated JSONL records are skipped with a warning when they
  affect coverage; they must not crash report generation.
- File-count and file-size limits bound accidental or hostile resource use.
- Unknown fields are ignored, not executed.
- Log text is data. AfterAI does not send it to another model, evaluate it as
  code, or follow instructions embedded inside it.
- Discovered test commands are not automatically executed. A verifier must be
  explicitly configured by the user.

When passing `--path`, select only logs you intend AfterAI to read. Do not point
it at an untrusted filesystem tree merely to discover files.

## Local files

Generated receipts can reveal development activity even after content
sanitization. Store them with user-only permissions where the platform supports
it, do not place them in a public repository by default, and delete them when no
longer needed. Leaderboard identity material under `~/.afterai` must remain local
and must never be printed in a report.

## Reporting a vulnerability

Use the repository's private security-advisory channel when available. Do not
open a public issue containing a real log, credential, private path, or exploit
payload. Include the smallest synthetic reproduction that demonstrates the
problem.
