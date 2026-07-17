import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSources } from "./scanner.js";
import { analyzeSessions } from "./analyzer.js";
import { renderTerminal } from "./terminal.js";
import { writeHtmlReport } from "./html.js";
import { createPrivacySnapshot } from "./privacy.js";
import { renderPrivacyTerminal } from "./privacy-terminal.js";
import { calculateTokenValue } from "./value.js";
import { detectCurrency, loadRates, normalizeCurrency, refreshRates } from "./currency.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createRecap(options = {}) {
  const scan = await scanSources(options);
  return analyzeSessions(scan.sessions, {
    range: options.range ?? "today", now: options.now, includeAll: options.demo === true, sourceWarnings: scan.warnings,
  });
}

export async function run(argv) {
  const options = parseArgs(argv);
  if (options.help) { process.stdout.write(helpText()); return; }

  if (options.mode === "privacy") {
    const snapshot = await createPrivacySnapshot({ ...options, demoPath: path.resolve(dirname, "../examples/privacy") });
    if (options.json) process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    else process.stdout.write(`${renderPrivacyTerminal(snapshot)}\n`);
    return;
  }

  if (options.demo) options.paths = [path.resolve(dirname, "../examples")];
  const currency = options.currency ?? detectCurrency();
  const rates = options.refreshRates ? await refreshRates() : await loadRates();
  const recap = await createRecap(options);
  recap.value = calculateTokenValue({ usage: recap.usage, models: recap.pricingModels, currency, rates });

  if (options.json) { process.stdout.write(`${JSON.stringify(recap, null, 2)}\n`); return; }
  process.stdout.write(`${renderTerminal(recap)}\n`);
  if (options.refreshRates) process.stdout.write(`\nExchange rates refreshed: ${rates.asOf}\n`);
  if (options.html) {
    const output = await writeHtmlReport(recap, options.html);
    process.stdout.write(`\nSaved local report: ${output}\n`);
  }
}

export function parseArgs(argv) {
  const options = { mode: "work", range: "today", paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "privacy") options.mode = "privacy";
    else if (["today", "yesterday", "week"].includes(arg)) options.range = arg;
    else if (arg === "--demo") options.demo = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--refresh-rates") options.refreshRates = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--currency") {
      const value = argv[index + 1];
      if (!value) throw new Error("--currency needs a three-letter ISO code such as AUD or USD");
      options.currency = normalizeCurrency(value);
      index += 1;
    } else if (arg === "--path") {
      const value = argv[index + 1];
      if (!value) throw new Error("--path needs a directory or JSONL file");
      options.paths.push(path.resolve(value)); index += 1;
    } else if (arg === "--html") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) { options.html = path.resolve(next); index += 1; }
      else options.html = path.resolve("afterai-report.html");
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function helpText() {
  return `AfterAI — know what your AI actually did.\n\nUsage:\n  afterai [today|yesterday|week]\n  afterai privacy\n  afterai --path ./sessions --html\n\nOptions:\n  --path <path>       Read a log or configuration path\n  --html [file]       Save a private local work report\n  --currency <ISO>    Show API-equivalent value in AUD, USD, EUR, etc.\n  --refresh-rates     Explicitly download and cache current exchange rates\n  --json              Print machine-readable results\n  --demo              Use the included evidence-backed demo\n  -h, --help          Show this help\n`;
}
