import test from "node:test";
import assert from "node:assert/strict";
import { renderTerminal } from "../src/terminal.js";
import { renderHtml } from "../src/html.js";

const recap = {
  range: "week",
  headline: "2 tasks need review.",
  counts: { sessions: 3, scanned: 5, hidden: 2, verified: 0, failed: 1, partial: 1 },
  usage: { totalTokens: 43_900_000 },
  sessions: [{
    id: "partial", source: "codex", title: "wifi densepose", status: "partial",
    models: ["gpt-5.6-sol"], usage: { totalTokens: 41_200_000 }, retryCount: 3,
    evidence: [{ type: "agent-report", exact: false, text: "Agent reported that work remains" }],
  }],
  attention: { text: "Review the failed download." },
  warnings: [],
};

test("terminal reports visible tasks and hidden chat honestly", () => {
  const output = renderTerminal(recap);
  assert.match(output, /2 tasks need review/);
  assert.match(output, /3 tasks shown/);
  assert.match(output, /2 inconclusive chat sessions hidden/);
  assert.match(output, /43\.9M tokens/);
});

test("HTML reports visible tasks and hidden chat honestly", () => {
  const output = renderHtml(recap);
  assert.match(output, /tasks shown/);
  assert.match(output, /2 inconclusive chat sessions hidden/);
  assert.match(output, /wifi densepose/);
});
