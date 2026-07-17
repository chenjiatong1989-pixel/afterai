import test from "node:test";
import assert from "node:assert/strict";
import { calculateTokenValue, formatMoneyRange } from "../src/value.js";
import { BUNDLED_RATES, detectCurrency, loadRates, normalizeCurrency, refreshRates } from "../src/currency.js";

test("prices cached input separately without double counting it", () => {
  const value = calculateTokenValue({
    usage: { inputTokens: 1_000_000, cacheTokens: 400_000, outputTokens: 100_000, totalTokens: 1_100_000 },
    models: ["gpt-5.6-sol"], currency: "AUD", rates: BUNDLED_RATES,
  });
  assert.equal(value.usd.low, 6.2);
  assert.equal(value.usd.high, 10.9);
  assert.equal(value.local.low, 8.84678);
  assert.equal(value.exchangeRate, 1.4269);
  assert.equal(value.actualBilled, null);
});

test("returns Unknown when only aggregate tokens or unknown model prices exist", () => {
  assert.equal(calculateTokenValue({ usage: { totalTokens: 100 }, models: ["gpt-future"], currency: "USD", rates: BUNDLED_RATES }).status, "unknown");
  assert.equal(calculateTokenValue({ usage: { totalTokens: 100 }, models: ["gpt-5.6-sol"], currency: "USD", rates: BUNDLED_RATES }).status, "unknown");
  assert.equal(calculateTokenValue({ usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 }, models: ["gpt-5.6-sol", "unknown-model"], currency: "USD", rates: BUNDLED_RATES }).status, "unknown");
});

test("detects Australian currency and accepts a manual ISO override", () => {
  assert.equal(detectCurrency("en-AU"), "AUD");
  assert.equal(detectCurrency("de-DE"), "EUR");
  assert.equal(normalizeCurrency(" aud "), "AUD");
  assert.throws(() => normalizeCurrency("A$"), /three-letter ISO/);
});

test("uses bundled rates when no valid cache exists", async () => {
  const rates = await loadRates({ cachePath: "/tmp/afterai-missing-rates-test.json" });
  assert.equal(rates.rates.AUD, 1.4269);
});

test("refreshes rates only through an explicit call", async () => {
  const cachePath = `/tmp/afterai-rates-${process.pid}.json`;
  const rates = await refreshRates({ cachePath, fetcher: async () => ({
    ok: true, json: async () => ({ base: "USD", date: "2026-07-17", rates: { AUD: 1.43 } }),
  }) });
  assert.equal(rates.rates.USD, 1);
  assert.equal(rates.rates.AUD, 1.43);
});

test("formats honest money ranges", () => {
  assert.equal(formatMoneyRange({ low: 10, high: 12 }, "USD", "en-US"), "$10.00–$12.00");
});
