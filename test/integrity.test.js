import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { scanSources } from "../src/scanner.js";
import { analyzeSessions } from "../src/analyzer.js";

test("corrupt JSONL emits a warning and cannot produce a Verified verdict", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "afterai-integrity-"));
  const file = path.join(directory, "codex-session.jsonl");
  const events = [
    { timestamp: "2026-07-20T10:00:00Z", type: "event_msg", payload: { type: "user_message", message: "private request" } },
    { timestamp: "2026-07-20T10:01:00Z", type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "npm test" }) } },
    { timestamp: "2026-07-20T10:01:01Z", type: "response_item", payload: { type: "function_call_output", call_id: "test", output: JSON.stringify({ exit_code: 0, output: "passed" }) } },
    { timestamp: "2026-07-20T10:02:00Z", type: "event_msg", payload: { type: "task_complete", last_agent_message: "Completed the work." } },
  ];
  await writeFile(file, `${events.map((event) => JSON.stringify(event)).join("\n")}\n{\"truncated\":`);

  try {
    const scan = await scanSources({ paths: [file] });
    const recap = analyzeSessions(scan.sessions, { includeAll: true, sourceWarnings: scan.warnings });
    assert.equal(scan.sessions[0].malformedLines, 1);
    assert.match(scan.warnings[0], /malformed or truncated/);
    assert.equal(recap.sessions[0].status, "unverified");
    assert.equal(recap.counts.verified, 0);
    assert.equal(recap.counts.unverified, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
