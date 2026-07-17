import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/index.js";

test("parses local currency and explicit exchange-rate refresh", () => {
  const options = parseArgs(["week", "--currency", "aud", "--refresh-rates", "--html"]);
  assert.equal(options.range, "week");
  assert.equal(options.currency, "AUD");
  assert.equal(options.refreshRates, true);
  assert.match(options.html, /afterai-report\.html$/);
});

test("rejects malformed currency codes", () => {
  assert.throws(() => parseArgs(["--currency", "A$"]), /three-letter ISO/);
});
