const MILLION = 1_000_000;

export const PRICING_SNAPSHOT = {
  asOf: "2026-07-17",
  source: "https://developers.openai.com/api/docs/pricing",
  models: {
    "gpt-5.6-sol": tiers(5, 0.5, 30, 10, 1, 45),
    "gpt-5.6-terra": tiers(2.5, 0.25, 15, 5, 0.5, 22.5),
    "gpt-5.6-luna": tiers(1, 0.1, 6, 2, 0.2, 9),
    "gpt-5.5": tiers(5, 0.5, 30, 10, 1, 45),
    "gpt-5.5-pro": tiers(30, 30, 180, 60, 60, 270),
    "gpt-5.4": tiers(2.5, 0.25, 15, 5, 0.5, 22.5),
    "gpt-5.4-mini": singleTier(0.75, 0.075, 4.5),
    "gpt-5.4-nano": singleTier(0.2, 0.02, 1.25),
    "gpt-5.4-pro": tiers(30, 30, 180, 60, 60, 270),
  },
};

export function calculateTokenValue({ usage, models = [], currency = "USD", rates }) {
  const total = Number(usage?.totalTokens ?? 0);
  if (total <= 0) return unknownValue(currency, "Token usage was not exposed by the source logs.");

  const observed = [...new Set(models)].map(normalizeModel);
  const recognized = observed.filter((model) => PRICING_SNAPSHOT.models[model]);
  if (recognized.length === 0) return unknownValue(currency, "No bundled API price matched the observed model.");
  if (recognized.length < observed.length) return unknownValue(currency, "Some observed models have no bundled API price, so a reliable total cannot be calculated.");

  const input = Math.max(0, Number(usage?.inputTokens ?? 0));
  const cached = Math.min(input, Math.max(0, Number(usage?.cacheTokens ?? 0)));
  const ordinary = Math.max(0, input - cached);
  const output = Math.max(0, Number(usage?.outputTokens ?? 0));
  if (input + output <= 0) return unknownValue(currency, "Only a total token count was available; input and output were not separated.");

  const estimates = recognized.flatMap((model) => {
    const pricing = PRICING_SNAPSHOT.models[model];
    return [priceUsage(ordinary, cached, output, pricing.short), priceUsage(ordinary, cached, output, pricing.long)];
  });
  const usd = range(Math.min(...estimates), Math.max(...estimates));
  const rate = currency === "USD" ? 1 : Number(rates?.rates?.[currency]);
  const local = Number.isFinite(rate) && rate > 0 ? range(usd.low * rate, usd.high * rate) : null;
  const reasons = ["API-equivalent estimate; not the amount billed by a subscription or account."];
  if (usd.low !== usd.high) reasons.push("A range is shown because per-request context tier or model allocation was not available.");

  return {
    status: "estimated",
    confidence: "Estimated",
    baseCurrency: "USD",
    localCurrency: currency,
    usd,
    local,
    exchangeRate: local ? rate : null,
    pricingAsOf: PRICING_SNAPSHOT.asOf,
    pricingSource: PRICING_SNAPSHOT.source,
    ratesAsOf: local ? rates?.asOf ?? null : null,
    ratesSource: local ? rates?.source ?? null : null,
    matchedModels: recognized,
    reasons,
    actualBilled: null,
  };
}

export function formatMoneyRange(value, currency, locale) {
  if (!value) return "Unknown";
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 });
  const low = formatter.format(value.low);
  return Math.abs(value.high - value.low) < 0.005 ? low : `${low}–${formatter.format(value.high)}`;
}

function normalizeModel(model) {
  const value = String(model).toLowerCase();
  return Object.keys(PRICING_SNAPSHOT.models).find((name) => value === name || value.startsWith(`${name}-`)) ?? value;
}

function priceUsage(input, cached, output, prices) {
  return (input * prices.input + cached * prices.cached + output * prices.output) / MILLION;
}

function range(low, high) {
  return { low: roundMoney(low), high: roundMoney(high) };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function tiers(shortInput, shortCached, shortOutput, longInput, longCached, longOutput) {
  return { short: { input: shortInput, cached: shortCached, output: shortOutput }, long: { input: longInput, cached: longCached, output: longOutput } };
}

function singleTier(input, cached, output) {
  const price = { input, cached, output };
  return { short: price, long: price };
}

function unknownValue(currency, reason) {
  return {
    status: "unknown", confidence: "Unknown", baseCurrency: "USD", localCurrency: currency,
    usd: null, local: null, exchangeRate: null, pricingAsOf: PRICING_SNAPSHOT.asOf,
    pricingSource: PRICING_SNAPSHOT.source, ratesAsOf: null, ratesSource: null,
    matchedModels: [], reasons: [reason], actualBilled: null,
  };
}
