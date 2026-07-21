import test from "node:test";
import assert from "node:assert/strict";
import { createReceipt } from "../src/receipt.js";
import { renderReceipt } from "../src/receipt-terminal.js";

function recap(overrides = {}) {
  return {
    generatedAt: "2026-07-20T18:00:00.000Z",
    range: "today",
    counts: { verified: 1, failed: 0, partial: 0, unverified: 0, unknown: 0, retries: 2 },
    usage: { source: "exact", totalTokens: 1200 },
    sessions: [{
      title: "Work on src/parser.js", status: "verified", models: ["gpt-primary", "gpt-review"],
      evidence: [
        { type: "files", files: ["src/parser.js"], attribution: "unknown" },
        { type: "verification", text: "npm test passed", exact: true },
      ],
    }],
    ...overrides,
  };
}

test("creates all eight evidence-labelled acceptance fields", () => {
  const receipt = createReceipt(recap());
  assert.equal(receipt.status, "VERIFIED");
  assert.deepEqual(receipt.models.value, ["gpt-primary", "gpt-review"]);
  assert.equal(receipt.tokens.value, 1200);
  assert.equal(receipt.changedFiles.attribution, "Unknown");
  for (const key of ["work", "succeeded", "failed", "changedFiles", "tests", "retries", "models", "tokens"]) {
    assert.match(receipt[key].evidence, /^(Exact|Estimated|Unknown)$/);
  }
});

test("missing tokens stay Unknown and a stale pass cannot be Verified", () => {
  const input = recap({
    counts: { verified: 0, failed: 0, partial: 0, unverified: 1, unknown: 0, retries: 0 },
    usage: { source: "unknown", totalTokens: 0 },
  });
  input.sessions[0] = {
    ...input.sessions[0], status: "unverified",
    evidence: [{ type: "verification", text: "npm test passed, but files changed afterward", stale: true }],
  };
  const receipt = createReceipt(input);
  assert.equal(receipt.status, "UNVERIFIED");
  assert.equal(receipt.tests.stale, true);
  assert.equal(receipt.tokens.value, "Unknown");
  assert.equal(receipt.tokens.evidence, "Unknown");
});

test("terminal output exposes the complete receipt without raw logs", () => {
  const output = renderReceipt(createReceipt(recap()));
  assert.match(output, /WHAT AI DID/);
  assert.match(output, /TESTS REALLY PASSED/);
  assert.match(output, /MODELS/);
  assert.match(output, /TOKENS/);
  assert.match(output, /VERIFIED/);
});

test("an empty period reports Unknown instead of estimated zero outcomes", () => {
  const receipt = createReceipt(recap({
    counts: { verified: 0, failed: 0, partial: 0, unverified: 0, unknown: 0, retries: 0 },
    usage: { source: "unknown", totalTokens: 0 },
    sessions: [],
  }));
  assert.equal(receipt.status, "UNKNOWN");
  assert.deepEqual(receipt.succeeded, { value: "Unknown", evidence: "Unknown", basis: receipt.succeeded.basis });
  assert.equal(receipt.failed.value, "Unknown");
  assert.equal(receipt.retries.value, "Unknown");
});
