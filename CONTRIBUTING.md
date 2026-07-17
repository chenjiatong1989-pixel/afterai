# Contributing

Thank you for helping make AI work easier to verify.

## Start here

```bash
npm test
npm run demo
```

## High-value contributions

- anonymized JSON/JSONL fixtures from supported tools
- tests for a real false positive or false negative
- parser improvements that preserve `Unknown` when data is absent
- Windows, macOS, and Linux path verification

Never commit prompts, source code, credentials, personal paths, or other private log contents. Reduce a fixture to the smallest synthetic structure that reproduces the behavior.

## Pull requests

Explain:

- which source format changed
- what evidence is present
- what result AfterAI produced before and after
- which tests prove the behavior

A completion claim by itself must never become verification evidence.
