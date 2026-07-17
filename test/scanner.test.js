import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { scanSources } from "../src/scanner.js";

test("scans JSONL without failing on malformed lines", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "afterai-test-"));
  const file = path.join(directory, "session.jsonl");
  await writeFile(file, [
    JSON.stringify({ timestamp: "2026-07-17T10:00:00Z", task: "Test scanner" }),
    "not-json",
    JSON.stringify({ timestamp: "2026-07-17T10:01:00Z", message: "Done" }),
  ].join("\n"));

  try {
    const result = await scanSources({ paths: [directory] });
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].events.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
