import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { analyzeSession, analyzeSessions } from "../src/analyzer.js";
import { scanSources } from "../src/scanner.js";
import { renderHtml } from "../src/html.js";

function codexSession(events, options = {}) {
  return {
    id: options.id ?? "redteam-session",
    source: "codex",
    file: options.file ?? "/Users/alice/.codex/sessions/2026/07/20/private.jsonl",
    events,
  };
}

function call(timestamp, id, name, args) {
  return {
    timestamp,
    type: "response_item",
    payload: { type: "function_call", name, call_id: id, arguments: typeof args === "string" ? args : JSON.stringify(args) },
  };
}

function output(timestamp, id, value) {
  return {
    timestamp,
    type: "response_item",
    payload: { type: "function_call_output", call_id: id, output: JSON.stringify(value) },
  };
}

test("a dirty baseline never turns an observed file operation into exact run attribution", () => {
  const session = analyzeSession(codexSession([
    {
      timestamp: "2026-07-20T10:00:00Z",
      type: "session_meta",
      payload: {
        model: "gpt-red",
        cwd: "/Users/alice/private-project",
        git: { head: "abc123", dirty: true, changed_files: ["src/preexisting.js"] },
      },
    },
    { timestamp: "2026-07-20T10:00:01Z", type: "event_msg", payload: { type: "user_message", message: "Finish the existing change" } },
    call("2026-07-20T10:01:00Z", "patch", "apply_patch", "*** Begin Patch\n*** Update File: src/preexisting.js\n*** End Patch"),
    call("2026-07-20T10:02:00Z", "test", "exec_command", { cmd: "npm test" }),
    output("2026-07-20T10:02:05Z", "test", { exit_code: 0, output: "12 tests passed" }),
  ]));

  const files = session.evidence.find((item) => item.type === "files");
  assert.ok(files, "the observed patch operation should still be reported");
  assert.equal(
    files.attribution ?? files.attributionEvidence ?? (files.exact === false ? "unknown" : undefined),
    "unknown",
    "a pre-existing dirty path cannot be attributed to this run without a captured baseline delta",
  );
});

test("a file edit after a passing verifier makes that verifier stale", () => {
  const session = analyzeSession(codexSession([
    { timestamp: "2026-07-20T11:00:00Z", type: "session_meta", payload: { model: "gpt-red", cwd: "/work/project" } },
    { timestamp: "2026-07-20T11:00:01Z", type: "event_msg", payload: { type: "user_message", message: "Fix checkout" } },
    call("2026-07-20T11:01:00Z", "patch-1", "apply_patch", "*** Begin Patch\n*** Update File: src/checkout.js\n*** End Patch"),
    call("2026-07-20T11:02:00Z", "test", "exec_command", { cmd: "npm test" }),
    output("2026-07-20T11:02:05Z", "test", { exit_code: 0, output: "All tests passed" }),
    call("2026-07-20T11:03:00Z", "patch-2", "apply_patch", "*** Begin Patch\n*** Update File: src/checkout.js\n*** End Patch"),
    { timestamp: "2026-07-20T11:04:00Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "Completed the checkout fix." } },
  ]));

  assert.notEqual(session.status, "verified", "a stale pass must never produce a green receipt");
  const verification = session.evidence.find((item) => item.type === "verification");
  assert.ok(verification, "the historical passing verifier remains useful evidence");
  assert.ok(
    verification.stale === true || /stale/i.test(`${verification.freshness ?? ""} ${verification.text ?? ""}`),
    "the evidence should explicitly mark the old pass stale",
  );
});

test("missing token metadata remains Unknown", () => {
  const session = analyzeSession(codexSession([
    { timestamp: "2026-07-20T12:00:00Z", type: "session_meta", payload: { model: "gpt-red" } },
    { timestamp: "2026-07-20T12:00:01Z", type: "event_msg", payload: { type: "user_message", message: "Inspect the parser" } },
  ]));

  assert.equal(session.usage.source, "unknown");
});

test("all observed models survive in first-seen order", () => {
  const session = analyzeSession(codexSession([
    { timestamp: "2026-07-20T13:00:00Z", type: "session_meta", payload: { model: "gpt-primary" } },
    { timestamp: "2026-07-20T13:00:01Z", type: "event_msg", payload: { type: "user_message", message: "Run a delegated review" } },
    { timestamp: "2026-07-20T13:00:02Z", type: "event_msg", payload: { type: "model_switched", model: "gpt-reviewer" } },
    { timestamp: "2026-07-20T13:00:03Z", type: "event_msg", payload: { type: "model_switched", model: "gpt-primary" } },
  ]));

  assert.deepEqual(session.models, ["gpt-primary", "gpt-reviewer"]);
});

test("malformed and truncated JSONL does not crash or leave a false green receipt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "afterai-redteam-"));
  const file = path.join(directory, "truncated.jsonl");
  await writeFile(file, [
    JSON.stringify({ timestamp: "2026-07-20T14:00:00Z", type: "session_meta", payload: { model: "gpt-red" } }),
    JSON.stringify({ timestamp: "2026-07-20T14:00:01Z", type: "event_msg", payload: { type: "user_message", message: "Verify before corruption" } }),
    JSON.stringify(call("2026-07-20T14:01:00Z", "test", "exec_command", { cmd: "npm test" })),
    JSON.stringify(output("2026-07-20T14:01:05Z", "test", { exit_code: 0, output: "All tests passed" })),
    "{ definitely-not-json }",
    '{"timestamp":"2026-07-20T14:02:00Z","type":"response_item","payload":{"type":"function_call","name":"apply_patch"',
  ].join("\n"));

  try {
    const scan = await scanSources({ paths: [file] });
    assert.equal(scan.sessions.length, 1);
    assert.equal(scan.sessions[0].events.length, 4);
    assert.match(scan.warnings.join("\n"), /malformed|truncated/i);
    const session = analyzeSession(scan.sessions[0]);
    assert.notEqual(session.status, "verified", "incomplete source coverage cannot retain a green verdict");
    assert.equal(session.evidence.some((item) => item.type === "source-integrity"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("default JSON and HTML receipt exports omit raw prompts and absolute source paths", () => {
  const rawPrompt = "PRIVATE_PROMPT_7f4c do not export this exact sentence";
  const absoluteRoot = "/Users/alice/secret-client";
  const recap = analyzeSessions([codexSession([
    { timestamp: "2026-07-20T15:00:00Z", type: "session_meta", payload: { model: "gpt-red", cwd: absoluteRoot } },
    { timestamp: "2026-07-20T15:00:01Z", type: "event_msg", payload: { type: "user_message", message: rawPrompt } },
    call("2026-07-20T15:01:00Z", "patch", "apply_patch", `*** Begin Patch\n*** Update File: ${absoluteRoot}/src/private.js\n*** End Patch`),
    { timestamp: "2026-07-20T15:02:00Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "Implemented the private change." } },
  ], { file: `${absoluteRoot}/.codex/sessions/private.jsonl` })], {
    range: "today",
    now: new Date("2026-07-20T18:00:00Z"),
  });

  const json = JSON.stringify(recap);
  const html = renderHtml(recap);
  for (const exported of [json, html]) {
    assert.doesNotMatch(exported, /PRIVATE_PROMPT_7f4c/);
    assert.doesNotMatch(exported, /do not export this exact sentence/);
    assert.doesNotMatch(exported, /\/Users\/alice/);
  }
});
