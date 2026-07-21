import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSession } from "../src/analyzer.js";

test("downgrades a passing check when a later patch makes it stale", () => {
  const session = analyzeSession({
    id: "stale-check",
    source: "codex",
    file: "/tmp/2026-07-20/session.jsonl",
    events: [
      { timestamp: "2026-07-20T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "Fix the parser" } },
      { timestamp: "2026-07-20T10:01:00Z", type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "npm test" }) } },
      { timestamp: "2026-07-20T10:01:01Z", type: "response_item", payload: { type: "function_call_output", call_id: "test", output: JSON.stringify({ exit_code: 0, output: "passed" }) } },
      { timestamp: "2026-07-20T10:02:00Z", type: "response_item", payload: { type: "function_call", name: "apply_patch", call_id: "patch", arguments: "*** Begin Patch\n*** Update File: src/parser.js\n*** End Patch" } },
      { timestamp: "2026-07-20T10:02:01Z", type: "response_item", payload: { type: "function_call_output", call_id: "patch", output: "Done" } },
      { timestamp: "2026-07-20T10:03:00Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "Implemented the parser fix." } },
    ],
  });

  assert.equal(session.status, "unverified");
  assert.equal(session.evidence.find((item) => item.type === "verification")?.stale, true);
});

test("keeps a pass fresh when verification happens after the last patch", () => {
  const session = analyzeSession({
    id: "fresh-check",
    source: "codex",
    file: "/tmp/2026-07-20/session.jsonl",
    events: [
      { timestamp: "2026-07-20T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "Fix the parser" } },
      { timestamp: "2026-07-20T10:01:00Z", type: "response_item", payload: { type: "function_call", name: "apply_patch", call_id: "patch", arguments: "*** Begin Patch\n*** Update File: src/parser.js\n*** End Patch" } },
      { timestamp: "2026-07-20T10:01:01Z", type: "response_item", payload: { type: "function_call_output", call_id: "patch", output: "Done" } },
      { timestamp: "2026-07-20T10:02:00Z", type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "npm test" }) } },
      { timestamp: "2026-07-20T10:02:01Z", type: "response_item", payload: { type: "function_call_output", call_id: "test", output: JSON.stringify({ exit_code: 0, output: "passed" }) } },
      { timestamp: "2026-07-20T10:03:00Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "Implemented the parser fix." } },
    ],
  });

  assert.equal(session.status, "verified");
  assert.equal(session.evidence.find((item) => item.type === "verification")?.stale, undefined);
});
