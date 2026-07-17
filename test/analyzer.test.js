import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSession, analyzeSessions } from "../src/analyzer.js";

test("marks a session verified only when deterministic verification passes", () => {
  const session = analyzeSession({
    id: "verified",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", task: "Fix login", model: "test-model" },
      { timestamp: "2026-07-17T10:01:00Z", file_path: "src/login.js" },
      { timestamp: "2026-07-17T10:02:00Z", command: "npm test", exit_code: 0 },
      { timestamp: "2026-07-17T10:03:00Z", message: "Completed the fix", usage: { input_tokens: 100, output_tokens: 20 } },
    ],
  });

  assert.equal(session.status, "verified");
  assert.equal(session.usage.totalTokens, 120);
  assert.deepEqual(session.models, ["test-model"]);
});

test("does not trust a completion claim when the last test failed", () => {
  const session = analyzeSession({
    id: "partial",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", task: "Fix checkout" },
      { timestamp: "2026-07-17T10:01:00Z", file_path: "src/checkout.js" },
      { timestamp: "2026-07-17T10:02:00Z", command: "npm test", exit_code: 1, error: "Test failed" },
      { timestamp: "2026-07-17T10:03:00Z", message: "Finished the checkout fix" },
    ],
  });

  assert.equal(session.status, "partial");
  assert.match(session.evidence[0].text, /failed/);
});

test("uses Unknown instead of inventing missing usage", () => {
  const recap = analyzeSessions([{
    id: "unknown",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [{ timestamp: "2026-07-17T10:00:00Z", task: "Inspect repository" }],
  }], { range: "today", now: new Date("2026-07-17T12:00:00Z") });

  assert.equal(recap.sessions[0].status, "unknown");
  assert.equal(recap.usage.source, "unknown");
  assert.equal(recap.usage.estimatedCostUsd, null);
});

test("detects repeated failed work", () => {
  const session = analyzeSession({
    id: "retry",
    source: "custom",
    file: "/tmp/2026-07-17.jsonl",
    events: [
      { timestamp: "2026-07-17T10:00:00Z", task: "Run integration tests" },
      { command: "npm run test:integration", exit_code: 1, stderr: "Error connection refused 5432" },
      { command: "npm run test:integration", exit_code: 1, stderr: "Error connection refused 5432" },
      { command: "npm run test:integration", exit_code: 1, stderr: "Error connection refused 5432" },
    ],
  });

  assert.equal(session.retryCount, 2);
  assert.match(session.repeatedFailure, /error connection refused/);
});
