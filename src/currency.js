import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const BUNDLED_RATES = {
  base: "USD",
  asOf: "2026-07-16",
  source: "Frankfurter (central-bank rates)",
  rates: {
    USD: 1, AUD: 1.4269, BRL: 5.0857, CAD: 1.4025, CHF: 0.80666,
    CNY: 6.7669, DKK: 6.519, EUR: 0.87207, GBP: 0.74015, HKD: 7.8397,
    INR: 96.35, JPY: 162.2, KRW: 1479.45, MXN: 17.4264, NOK: 9.6486,
    NZD: 1.7078, PLN: 3.7747, SEK: 9.6176, SGD: 1.2891, ZAR: 16.3711,
  },
};

const REGION_CURRENCY = {
  AU: "AUD", BR: "BRL", CA: "CAD", CH: "CHF", CN: "CNY", DK: "DKK",
  GB: "GBP", HK: "HKD", IN: "INR", JP: "JPY", KR: "KRW", MX: "MXN",
  NO: "NOK", NZ: "NZD", PL: "PLN", SE: "SEK", SG: "SGD", US: "USD", ZA: "ZAR",
};
const EURO_REGIONS = new Set(["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]);

export function detectCurrency(locale = Intl.DateTimeFormat().resolvedOptions().locale) {
  try {
    const region = new Intl.Locale(locale).region;
    if (EURO_REGIONS.has(region)) return "EUR";
    return REGION_CURRENCY[region] ?? "USD";
  } catch {
    return "USD";
  }
}

export function normalizeCurrency(value) {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("--currency needs a three-letter ISO code such as AUD or USD");
  return currency;
}

export async function loadRates(options = {}) {
  const cachePath = options.cachePath ?? defaultCachePath();
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8"));
    if (parsed?.base === "USD" && parsed?.rates?.USD === 1) return parsed;
  } catch {
    // Missing or invalid cache: bundled rates keep normal reports offline.
  }
  return BUNDLED_RATES;
}

export async function refreshRates(options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("This Node.js version cannot refresh exchange rates");
  const response = await fetcher("https://api.frankfurter.dev/v1/latest?base=USD");
  if (!response.ok) throw new Error(`Exchange-rate refresh failed (${response.status})`);
  const payload = await response.json();
  if (payload?.base !== "USD" || !payload?.date || !payload?.rates) throw new Error("Exchange-rate service returned an unexpected response");
  const snapshot = { base: "USD", asOf: payload.date, source: "Frankfurter (central-bank rates)", rates: { USD: 1, ...payload.rates } };
  const cachePath = options.cachePath ?? defaultCachePath();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

export function defaultCachePath() {
  return path.join(os.homedir(), ".afterai", "rates.json");
}
