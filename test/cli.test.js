import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/index.js";

test("parses the intentionally small CLI", () => {
  const options = parseArgs(["week", "--path", "./logs", "--html", "./report.html"]);
  assert.equal(options.range, "week");
  assert.equal(options.paths.length, 1);
  assert.match(options.html, /report\.html$/);
});

test("rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--dashboard"]), /Unknown option/);
});

test("selects the privacy module without changing the small CLI", () => {
  const options = parseArgs(["privacy", "--demo"]);
  assert.equal(options.mode, "privacy");
  assert.equal(options.demo, true);
});
