import path from "node:path";
import { writeFile } from "node:fs/promises";
import { formatMoneyRange } from "./value.js";

const STATUS = {
  verified: ["Verified", "good"],
  unverified: ["Unverified", "warn"],
  partial: ["Partial", "bad"],
  failed: ["Failed", "bad"],
  unknown: ["Unknown", "muted"],
};

export async function writeHtmlReport(recap, destination) {
  const output = path.resolve(destination);
  await writeFile(output, renderHtml(recap), "utf8");
  return output;
}

export function renderHtml(recap) {
  const cards = recap.sessions.map((session) => {
    const [label, tone] = STATUS[session.status];
    const evidence = session.evidence.length
      ? session.evidence.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")
      : "<li>No deterministic evidence found.</li>";
    return `<article class="task">
      <div class="row"><span class="pill ${tone}">${label}</span><span class="source">${escapeHtml(session.source)}</span></div>
      <h3>${escapeHtml(session.title)}</h3>
      <ul>${evidence}</ul>
    </article>`;
  }).join("");
  const hidden = recap.counts.hidden > 0
    ? `<p class="hidden">${recap.counts.hidden} inconclusive chat session${recap.counts.hidden === 1 ? "" : "s"} hidden. Their usage remains included in the token total.</p>`
    : "";
  const value = renderTokenValue(recap.value);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AfterAI · ${escapeHtml(recap.range)}</title>
<style>
:root{color-scheme:dark;--bg:#0b0c0f;--card:#15171c;--line:#292d36;--text:#f5f7fb;--muted:#9299a8;--green:#64e6a6;--amber:#ffc766;--red:#ff7d8d;--blue:#8fb8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}.wrap{width:min(820px,calc(100% - 32px));margin:64px auto}.eyebrow{color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}h1{font-size:clamp(30px,6vw,54px);line-height:1.06;margin:12px 0 32px;max-width:750px}.summary,.task,.next,.value{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat strong{display:block;font-size:28px}.stat span,.source,li,.hidden,.value small{color:var(--muted)}.hidden{margin:12px 4px 0;font-size:13px}.value{margin:28px 0;border-color:#33415b}.value-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:12px}.value strong{display:block;font-size:24px;color:var(--blue)}.tasks{display:grid;gap:12px;margin:28px 0}.task h3{font-size:18px;margin:14px 0 8px}.task ul{margin:0;padding-left:18px}.row{display:flex;align-items:center;justify-content:space-between}.pill{font-size:12px;font-weight:750;padding:4px 9px;border-radius:999px}.good{background:#143c2c;color:var(--green)}.warn{background:#433718;color:var(--amber)}.bad{background:#451f28;color:var(--red)}.muted{background:#292d36;color:#c5cad4}.next{border-color:#3a404c}.next p{font-size:18px;margin:8px 0 0}.privacy{color:var(--muted);font-size:12px;margin-top:24px}@media(max-width:560px){.wrap{margin:30px auto}.stats,.value-grid{grid-template-columns:1fr}.stat{display:flex;align-items:baseline;gap:10px}}
</style>
</head>
<body><main class="wrap">
  <div class="eyebrow">After AI · ${escapeHtml(recap.range)}</div>
  <h1>${escapeHtml(recap.headline)}</h1>
  <section class="summary stats">
    <div class="stat"><strong>${recap.counts.sessions}</strong><span>tasks shown</span></div>
    <div class="stat"><strong>${recap.counts.verified}</strong><span>verified</span></div>
    <div class="stat"><strong>${formatNumber(recap.usage.totalTokens)}</strong><span>tokens</span></div>
  </section>
  ${hidden}
  ${value}
  <section class="tasks">${cards || '<article class="task"><h3>No actionable AI work found.</h3><p class="source">Try the demo or point AfterAI at a log directory.</p></article>'}</section>
  <section class="next"><div class="eyebrow">Next</div><p>${escapeHtml(recap.attention.text)}</p></section>
  <p class="privacy">Generated locally. No logs were uploaded.</p>
</main></body></html>`;
}

function renderTokenValue(value) {
  if (!value || value.status !== "estimated") {
    return `<section class="value"><div class="eyebrow">Token value</div><p>Unknown — ${escapeHtml(value?.reasons?.[0] ?? "pricing evidence is incomplete.")}</p></section>`;
  }
  const local = value.localCurrency === "USD" ? "" : `<div><small>Local equivalent</small><strong>${escapeHtml(formatMoneyRange(value.local, value.localCurrency))}</strong></div>`;
  const rate = value.localCurrency === "USD" ? "" : ` Exchange rate: 1 USD = ${escapeHtml(value.exchangeRate)} ${escapeHtml(value.localCurrency)} (${escapeHtml(value.ratesAsOf)}).`;
  return `<section class="value"><div class="eyebrow">Token value · estimated</div><div class="value-grid"><div><small>API equivalent</small><strong>${escapeHtml(formatMoneyRange(value.usd, "USD", "en-US"))}</strong></div>${local}</div><p><small>Pricing snapshot: ${escapeHtml(value.pricingAsOf)}.${rate} Actual amount billed: Unknown.</small></p></section>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function formatNumber(value) {
  if (!value) return "Unknown";
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}
